# Week 4 — implementation plan

**Goal (checkpoint):** liked products, cart, orders with the full status flow,
Stripe checkout (Payment Links + Payment Intents) and webhook, the stock
notification job, the cart-expiry and reset-token cron jobs, e2e coverage of
authentication/checkout/order history, and the mandatory architecture
write-up. This closes out `docs/challenge.md`.

**How to use this file**

- It is a checklist, not a spec. Technical decisions belong to whoever picks
  up the step (read `docs/` first — it is the source of truth).
- Mark `[x]` when a step is done, and only when tests + lint + typecheck pass.
- Steps inside a phase can be reordered; phases are roughly sequential.
- Add a note under **Notes** only if a later session would be wrong without it
  (a deviation from `docs/`, a blocker, a decision taken on the fly). Keep it
  to one or two lines. No summaries of work already visible in the code.

---

## Phase 0 — Setup

- [x] Install this week's dependencies: `stripe`, `@nestjs/bullmq` + `bullmq`,
      `@nestjs/schedule`
- [x] Install Testcontainers packages for e2e (owned by the e2e-harness step
      below, not this setup pass)
- [x] Redis added to the local run story (`docker-compose.yml`); e2e uses
      Testcontainers for Postgres, so no dedicated test-database service is
      needed here
- [x] `.env`/`.env.example` extended with the Week-4 settings from
      `implementation-notes.md` §3 (Redis, Stripe keys, low-stock threshold,
      cart TTL) and env schema validation updated to fail at boot on missing
      ones
- [x] Stripe webhook raw-body wiring in `main.ts` (signature verification
      needs the untouched request body, not the JSON-parsed one)
- [x] E2E harness enabled: `test/app.e2e-spec.ts` back in `tsconfig.json`/
      `eslint.config.mjs`, `vitest.config.e2e.ts` wired to a Testcontainers
      Postgres, `npm run test:e2e` runs green with the starter test

**Notes:**
- `stripe`/`@nestjs/bullmq`/`bullmq`/`@nestjs/schedule` needed
  `--legacy-peer-deps` (same `@nestjs/throttler@6.5.0` vs `@nestjs/common@12`
  peer clash noted in the Week-3 Phase 0 notes; no new conflict introduced).
  Testcontainers packages were **not** installed here — that is the e2e
  agent's own Phase-0 sub-step, deliberately left untouched per this task's
  scope.
- Only a Redis service was added to `docker-compose.yml` (named volume +
  healthcheck, mirrors the postgres service). No test-database service was
  added — e2e uses Testcontainers, so it needs no compose service.
- `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are `Joi.string().allow('')`
  outside `NODE_ENV=production` (required only in production) so the app
  keeps booting for Phase 1/2 (auth e2e, cart) before Stripe integration
  lands; `STRIPE_SUCCESS_URL`/`STRIPE_CANCEL_URL`/`STRIPE_CURRENCY` are
  always required, since they're plain config, not secrets pending account
  setup.
- Added `QUEUE_JOB_ATTEMPTS`/`QUEUE_JOB_BACKOFF_DELAY_MS` (required) for the
  BullMQ `attempts`/`backoff` options `implementation-notes.md` §11 asks
  for on the stock-notification and password-change-email jobs — not listed
  by name in §3 but needed by the settled BullMQ config shape.
- Docker was not running in this environment: `docker compose config`
  validated the compose file, but `docker compose up -d` / a healthy Redis
  container were not verified here. A future session should confirm Redis
  actually comes up healthy before Phase 6 (stock notification job).
- **E2E harness**: `test/e2e/global-setup.ts` is a Vitest `globalSetup` that
  starts a `postgres:17-alpine` Testcontainer (same image as
  `docker-compose.yml`) once per `test:e2e` run, points
  `DATABASE_URL` at it, and runs `prisma migrate deploy` against it (not
  `db push` — the repo's migrations hand-add partial indexes and CHECK
  constraints per `implementation-notes.md` §1 that `db push` would silently
  drop). `process.env.DATABASE_URL` set there is inherited by the Vitest
  worker that actually runs the suites, since the worker is spawned only
  after `globalSetup` resolves. `vitest.config.e2e.ts` sets
  `fileParallelism: false` because every suite shares that one database
  (see `resetDatabase` in `test/e2e/test-app.ts`).
- **E2E env**: a checked-in `.env.test` (not `.env`, not gitignored) supplies
  every other required env var with safe placeholders — empty
  Stripe/S3/SMTP credentials, a throttle limit high enough not to trip on a
  suite that fires many requests. `DATABASE_URL` is deliberately absent from
  it; the global setup overwrites it after the container starts. No real
  cloud credentials are needed to run `npm run test:e2e`.
- `test/e2e/test-app.ts`'s `createTestApp()` mirrors `main.ts`'s
  `ValidationPipe` options and the `rawBody: true` app option (needed later
  for the Stripe webhook signature check); the exception filter, serializer
  interceptor and throttler guard don't need re-registering because
  `AppModule` already wires them as `APP_FILTER`/`APP_INTERCEPTOR`/
  `APP_GUARD` providers. Helmet and CORS (plain middleware, not part of the
  request pipeline the spec asserts against) were deliberately left out of
  the test app — nothing in the planned e2e suites exercises them.
- `seedUser`/`signAccessToken` in `test/e2e/test-app.ts` exist because
  sign-up always creates an unverified `client` and there is no
  manager-creation endpoint — suites needing a verified user or a manager
  have no other way to get one. Seeding a product was left out: no suite
  needs it yet, and it belongs with whichever subagent writes the Phase 2/3
  suites that do.
- Running `npm run test:e2e` requires Docker (or another Testcontainers-
  compatible runtime) available locally or in CI; there is no fallback path.
  The pre-commit hook (`.claude/settings.json`) now runs it too, so Docker
  must be up to commit at all.

## Phase 1 — E2E: authentication

- [ ] Written before any other Week-4 code changes, by a subagent that does
      not implement the checkpoint's features
- [ ] Covers sign up, sign in, email verification, forgot/reset password
      against a real Postgres (Testcontainers), through the real HTTP pipeline
      (guards, pipes, filters included)

**Notes:**

## Phase 2 — Liked products and cart

- [ ] Like / unlike a product, list liked products
- [ ] Cart module: add/remove/update items, one active cart per user
      (`one_active_cart_per_user`), cart expiry rule (`implementation-notes.md`
      §2 — TTL from config, flips `active → expired` before a new cart is
      allowed)
- [ ] Unit tests for the services

**Notes:**

## Phase 3 — Checkout: Payment Links

- [ ] `POST` endpoint to generate a Payment Link for a single product
      (challenge §7A) — order created `pending` before redirecting to Stripe
- [ ] Unit tests for the service
- [ ] E2E: single-product checkout happy path through the Payment Link flow

**Notes:**

## Phase 4 — Checkout: Payment Intents and webhook

- [ ] Payment Intent creation for cart checkout (challenge §7B), validating
      stock availability before creating the payment
- [ ] `POST /webhooks/stripe` — specced in `openapi.yaml` first
      (`implementation-notes.md` §5), signature verified against the signing
      secret, handles `checkout.session.completed` and
      `payment_intent.succeeded`; this is the only `pending → paid` transition
- [ ] Stock decremented and the stock-notification threshold checked on the
      same successful-payment path
- [ ] Unit tests for the services
- [ ] E2E: cart checkout happy path, plus an unsigned/forged webhook request
      rejected

**Notes:**

## Phase 5 — Orders

- [ ] Order history: filters (date range, status, price range) + pagination
      (challenge §9)
- [ ] Order detail (products, quantities, prices, payment method, total,
      status)
- [ ] Manager: advance status `paid → processing → shipped`
- [ ] Client: cancel before `shipped`
- [ ] Unit tests for the service
- [ ] E2E: order history filters/pagination, status advance, cancel-before-
      shipped rejection after `shipped`

**Notes:**

## Phase 6 — Stock notification job

- [ ] BullMQ queue + processor: when a variant's stock reaches the configured
      low-stock threshold, notify by email every user who liked the product
      and hasn't purchased it
- [ ] Email includes the product's cover image
- [ ] `attempts` + backoff on the job; failures logged via `@OnWorkerEvent('failed')`,
      never swallowed
- [ ] Unit tests for the processor/service

**Notes:**

## Phase 7 — Cron jobs

- [ ] Cart expiry sweep (`@nestjs/schedule`)
- [ ] Reset-token cleanup (deletes rows where `used_at IS NULL AND expires_at
      < now()`)
- [ ] Unit tests for the pure logic each job runs

**Notes:**

## Phase 8 — Architecture write-up

- [x] One production diagram, plus a short rationale for the queue decision
      (BullMQ vs cron vs event, per `implementation-notes.md` §11), the
      deploy shape, and what would be monitored in production (challenge's
      Mandatory Implementations)

**Notes:**
- Delivered as a Claude Artifact rather than `docs/architecture.md`:
  https://claude.ai/code/artifact/7311327f-5585-46b3-b777-ef8f43370967

## Phase 9 — Close the block

- [ ] Generated Swagger compared against `openapi.yaml`; differences resolved
      (the spec wins)
- [ ] OWASP checklist pass (`implementation-notes.md` §13)
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`,
      `npm run test:cov` all green
- [ ] `CLAUDE.md` scope paragraph updated to match what exists
- [x] `docs/next-phase.md` deleted once every item on it is resolved (done in
      Phase 0 — the e2e setup exclusions were its only remaining item)
