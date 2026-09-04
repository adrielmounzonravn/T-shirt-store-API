# Deployment plan — demo deploy

Post-checkpoint task, not part of `docs/challenge.md` scope. This is a **throwaway deploy for review only** — created 2026-09-02, expected to be looked at for at most 14 days after that. Every decision below optimizes for "free and good enough for 14 days," not for production correctness. Do not carry these choices into any future real-production deploy without reconsidering them.

## Settled decisions

| Concern | Decision | Why |
|---|---|---|
| App hosting | **Render** free web service | Only major provider with a real, non-expiring free tier (Railway/Fly.io dropped theirs). Sleeps after 15 min idle, ~1 min cold start on wake — acceptable for a demo. |
| PostgreSQL | **Supabase** free project | Permanently free (unlike Render's free Postgres, which hard-expires 30 days after creation). Auto-pauses after 7 days with no requests — fine, just needs a manual wake before review if it's been quiet. |
| Redis (BullMQ) | **Upstash** free Redis | Permanently free (500K commands/mo, 256MB), unlike AWS ElastiCache which has no free tier for new-model AWS accounts. Requires TLS + password — the app doesn't support that yet (see Step 1). |
| Image storage | **Existing AWS S3 bucket** (already configured, `S3_BUCKET`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` in `.env.example`) | Already real and working. No change needed. |
| SMTP | **Existing Mailtrap connection** (already configured, `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`) | Already real and working. No change needed. |
| Stripe | Existing **test-mode** keys | No hosting cost; webhook endpoint just needs to point at the new Render URL (Step 6). |
| Swagger UI (`/docs`) | **Not exposed** — `main.ts` only mounts it when `NODE_ENV=development`, and we're deploying with `NODE_ENV=production` (Stripe env validation requires production semantics). Don't change this gating for the demo. | Avoids touching app behavior just to satisfy a hosting constraint. Reviewer uses the checked-in `docs/openapi.yaml` (import into a local Swagger UI or Postman) instead of a live `/docs` page. |
| Heroku / Railway / Fly.io / AWS EC2+RDS+ElastiCache | Rejected | Heroku has no free tier since Nov 2022 (cheapest is $5/mo). Railway/Fly.io dropped free tiers. AWS EC2/RDS/ElastiCache are only free for accounts opened before 2025-07-15 and still in their first 12 months — not free otherwise. |
| Teardown | Delete Render service, Supabase project, and Upstash database once the review window closes (~2026-09-16) | Nothing here should be left running indefinitely; it's not monitored or maintained infra. |

## HTTPS / TLS checklist

The requirement was to "handle HTTPS from the start" for security practice, so this isn't just "the platform gives me a padlock" — checked what that means end-to-end for this app:

- **Public traffic (browser/client ↔ Render)**: Render provisions a managed TLS cert automatically for the `onrender.com` subdomain and **auto-redirects HTTP→HTTPS at the edge** — confirmed via Render's docs, no app code or config needed for this part.
- **HSTS**: already covered — `helmet()` in `src/main.ts` sends `Strict-Transport-Security` by default (helmet v4+ defaults: 180 days, `includeSubDomains`). Nothing to add. `preload` isn't relistevant here since this is a throwaway `onrender.com` subdomain, not a domain we'd submit to the HSTS preload list.
- **Client IP / scheme trust behind Render's proxy — real gap, folded into Step 1**: Render terminates TLS at its edge and forwards plain HTTP internally with `X-Forwarded-*` headers. Express doesn't trust those by default, so `req.ip` collapses to Render's internal proxy address for every request. That silently breaks the per-IP throttling this project already hardened (`ThrottlerGuard`, plus the stricter rate limit on `POST /auth/signin` from commit `77b3330`) — every client would share one bucket instead of being limited individually. Needs `app.set('trust proxy', 1)` in `main.ts`.
- **Database traffic (app ↔ Supabase)**: Supabase requires SSL; append `?sslmode=require` to the `DATABASE_URL` used by `@prisma/adapter-pg` (confirmed `pg`, which the adapter wraps, parses `sslmode` directly from the connection string — no code change needed, just the query param in Step 2/5).
- **Redis traffic (app ↔ Upstash)**: already covered by Step 1's `REDIS_TLS=true` — Upstash requires TLS, plain `redis://` won't connect.
- **Stripe webhook**: already HTTPS-only by Stripe's own requirement, and signature verification (`req.rawBody` + `Stripe-Signature`) already implemented in `src/webhooks/webhooks.controller.ts` — no gap.
- **Cookies**: none used anywhere in the app (auth is bearer-JWT only, no session cookies) — no `Secure`/`SameSite` flags to worry about.
- **CORS/Stripe redirect URLs**: make sure `CORS_ALLOWED_ORIGINS`, `STRIPE_SUCCESS_URL`, and `STRIPE_CANCEL_URL` (Step 5) are set to `https://` URLs, not `http://` — easy to paste the wrong scheme by habit from the `.env.example` localhost defaults.

## Steps

Work through these one at a time. Each is scoped to be handed to a single agent turn.

### Step 1 — Harden config for a hosted, proxied deployment (Redis TLS + trust proxy)

Two small, mechanical config changes needed before this app can sit behind Render/Upstash — see the HTTPS/TLS checklist above for why each matters:

- **Redis TLS/password**: Upstash requires TLS and a password; the app currently only supports plain `REDIS_HOST`/`REDIS_PORT` (`src/config/configuration.ts`, `src/app.module.ts`'s `BullModule.forRootAsync`, `src/config/env.validation.ts`). Add optional `REDIS_PASSWORD` and `REDIS_TLS` (`"true"`/`"false"`) to `.env.example`, `src/config/configuration.ts`, and `src/config/env.validation.ts` (both optional — local dev via `docker-compose.yml` has neither). Pass `password` and `tls: {}` (when `REDIS_TLS=true`) into the `connection` object in `BullModule.forRootAsync`.
- **Trust the reverse proxy**: add `app.set('trust proxy', 1)` in `src/main.ts` (right after `NestFactory.create`). Without it, `req.ip` collapses to Render's internal proxy address for every request, and the per-IP throttling (`ThrottlerGuard`, including the stricter `POST /auth/signin` limit from `77b3330`) stops being per-IP.
- These are config/wiring changes with no new business logic — decide per `CLAUDE.md`'s testing rule whether they need new unit tests (likely just extending `env.validation.spec.ts`'s existing coverage for the two new optional fields, rather than a new subagent-written suite, since there's no new service/behavior).
- Verify `npm run typecheck`, `npm test`, and `npm run lint` still pass.

### Step 2 — Provision Supabase Postgres

- Create a free Supabase project (region close to Render's, e.g. `us-east`).
- Grab the **direct connection** string from Supabase's dashboard (port 5432, not the port-6543 pgbouncer one) — with a single small Render instance and low demo traffic, the pooler adds complexity (would need a separate `DIRECT_URL` for `prisma migrate deploy` vs. a pooled `DATABASE_URL` for the app) without any real benefit, so just use the direct connection for both.
- Append `?sslmode=require` to that connection string — Supabase requires SSL, and `@prisma/adapter-pg` (via `pg`) reads `sslmode` straight from the URL, no code change needed.
- Run `npx prisma migrate deploy` locally against that `DATABASE_URL` to apply all existing migrations (never `db push` — see `implementation-notes.md` §1).
- Confirm tables exist via Supabase's table editor or `psql`.

**Deviation actually taken**: `npx prisma migrate deploy` could not reach the database from this local sandbox — Supabase's direct-connection hostname (`db.<project>.supabase.co:5432`) resolves to an **IPv6-only** address (no A/IPv4 record), and the sandbox has no IPv6 route (confirmed via `dig`/`nc -6`). Applied both migrations instead through the Supabase MCP server (`apply_migration`, which goes over Supabase's HTTPS management API, not raw Postgres TCP), then manually created `_prisma_migrations` and inserted rows with the correct sha256 checksums for each migration file so the tracking table matches what `prisma migrate deploy` would have produced. Verified via `list_tables`: all 10 app tables + `_prisma_migrations` (2 rows) exist.

**Open risk carried into Step 4/5**: this only proves the *migration* path works around the IPv6 issue. The running app on Render still needs a normal TCP `DATABASE_URL` connection at runtime — if Render's outbound networking also lacks IPv6 (unconfirmed), the direct-connection string will fail there too, and Step 5 will need the **Session pooler** connection string instead (`aws-0-<region>.pooler.supabase.com`, which has IPv4). Test this explicitly once the Render service exists, before assuming the direct connection string works for `DATABASE_URL`.

**Risk resolved**: Render's outbound networking also lacked IPv6, so `DATABASE_URL` on the deployment uses the Supabase **session pooler** connection string, not the direct connection. Step 5's `DATABASE_URL` value below is stale on that point — the deployed value is the pooler host.

**Also surfaced, not acted on**: Supabase's advisor flags RLS as disabled on all 10 tables (severity "critical" in its own scoring). Not applicable here — this app never uses Supabase's client SDK or `anon`/`authenticated` roles; Prisma connects with the `postgres` role directly over TCP, and authorization is enforced in-app via CASL. Left as-is deliberately.

### Step 3 — Provision Upstash Redis

- Create a free Upstash Redis database (TCP/Redis protocol, not the REST-only mode), same region as Render if possible to minimize latency.
- In Upstash's config, set `maxmemory-policy` to `noeviction` — BullMQ requires this; Upstash's default eviction policy will silently break job persistence otherwise.
- Note the host, port, and password from Upstash's dashboard for Step 5.

### Step 4 — Create the Render web service

- New Render account/workspace if none exists, connect the GitHub repo (`main` branch).
- Runtime: Node. Build command: `npm ci && npm run build && npx prisma generate` (Prisma client output is gitignored at `src/generated/prisma`, must be regenerated on deploy). Start command: `npm run start:prod`.
- Don't enable auto-deploy on every push unless that's actually wanted for the review window — a manual deploy trigger is safer for a throwaway environment.

### Step 5 — Configure environment variables on Render

Set every var from `.env.example` (plus the two new ones from Step 1) using **real** values:

- `NODE_ENV=production`
- `PORT` — Render sets this automatically; don't hardcode.
- `DATABASE_URL` — Supabase direct connection string from Step 2, with `?sslmode=require`.
- `CART_TTL_HOURS`, `RESET_TOKEN_TTL_HOURS`, `EMAIL_VERIFICATION_TOKEN_TTL_HOURS`, `LOW_STOCK_THRESHOLD`, `BCRYPT_SALT_ROUNDS` — same as `.env.example` defaults unless there's a reason to change them.
- `JWT_SECRET` — generate a real random secret, not `change-me`.
- `JWT_EXPIRES_IN` — same as default.
- `CORS_ALLOWED_ORIGINS` — set to wherever the reviewer will call the API from, **as `https://`** (or `*`-equivalent if there's no frontend, just direct API/Postman use).
- `THROTTLE_*` — same as defaults.
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS=true` — from Step 3.
- `QUEUE_JOB_ATTEMPTS`, `QUEUE_JOB_BACKOFF_DELAY_MS` — same as defaults.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — real test-mode keys (webhook secret comes from Step 6, may need to circle back).
- `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL` — update to point at the **`https://`** Render URL instead of `localhost:3000`.
- `STRIPE_CURRENCY` — same as default.
- `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` — existing real bucket credentials.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` — existing real Mailtrap credentials.

### Step 6 — Deploy, wire the Stripe webhook, smoke test

- Trigger the first deploy, watch build logs.
- Hit `GET /health` (see `src/health`) to confirm the app is up.
- In the Stripe test-mode dashboard, add a webhook endpoint pointing at `https://<render-url>/webhooks/stripe`, copy the resulting signing secret into `STRIPE_WEBHOOK_SECRET` on Render, redeploy.
- Manually walk the critical paths once against the live URL: sign up/sign in, browse products, add to cart, checkout (test card), confirm the webhook moves the order to `paid`, check order history/filters. This is the "test the golden path in a real environment" step — not automated, do it by hand or with a REST client.

### Step 7 — Housekeeping for the review window

- Write down all three dashboards' logins/links somewhere outside the repo (not committed — these are live credentials).
- If review happens more than ~6 days after deploy, remember to open the Supabase dashboard first to un-pause the project before the reviewer hits it.
- Calendar reminder around 2026-09-16 to tear everything down (Step 8) — don't let free-tier infra linger unmonitored past the review window.

### Step 8 — Teardown (after the review window closes)

- Delete the Render service.
- Delete the Supabase project.
- Delete the Upstash database.
- Revert/remove the Step 1 code change only if it's not wanted going forward — otherwise it's harmless to keep (optional TLS support doesn't hurt local dev).
