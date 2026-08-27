# Week 3 — implementation plan

**Goal (checkpoint):** authentication, products, and SKUs/variants (basic
catalog) implemented, hardened, and covered by unit tests. Cart, orders,
payments and stock notifications are Week 4 — see `next-phase.md`.

**How to use this file**

- It is a checklist, not a spec. Technical decisions belong to whoever picks up
  the step (read `docs/` first — it is the source of truth).
- Mark `[x]` when a step is done, and only when tests + lint + typecheck pass.
- Steps inside a phase can be reordered; phases are roughly sequential.
- Add a note under **Notes** only if a later session would be wrong without it
  (a deviation from `docs/`, a blocker, a decision taken on the fly). Keep it to
  one or two lines. No summaries of work already visible in the code.

---

## Phase 0 — Baseline: infra, deps, config

- [x] Local run story for Postgres (docker-compose or documented alternative)
- [x] Install the dependencies this week needs (config/validation, validation
      pipe, Passport + JWT, hashing, CASL, helmet, throttler, Swagger, mailer)
- [x] `.env` + `.env.example` with the Week-3 settings from
      `implementation-notes.md` §3
- [ ] Env schema validation that fails at boot
- [ ] Enable the Swagger CLI plugin in `nest-cli.json`

**Notes:**

- `@nestjs/throttler` (latest published: 6.5.0) hasn't updated its peer range
  for `@nestjs/common`/`core` 12.x yet — installed with `--legacy-peer-deps`.
  Re-check for a compatible release before assuming this workaround is still
  needed.
- Went with `joi` for env validation, `bcrypt` for hashing (native binding
  loaded fine via prebuilds — no ESM/build issue hit, so no need for the
  `bcryptjs` fallback), and `nodemailer` for the mailer.
- `.env`/`.env.example` add `NODE_ENV`, `PORT`, `DATABASE_URL` (infra, not a
  §3 domain setting) and `SMTP_*` (nodemailer needs a transport; §3's table
  doesn't list it).

## Phase 1 — Data model

- [ ] Translate the DBML into `schema.prisma`
- [ ] First migration, hand-edited with the partial indexes and CHECK
      constraints from `implementation-notes.md` §1
- [ ] Migration applies from scratch on a clean database
- [ ] Seed script (a manager, a client, a couple of products/variants)

**Notes:**

## Phase 2 — Application shell

- [ ] `PrismaModule` / `PrismaService` + shutdown hooks
- [ ] Global validation pipe, serialization interceptor, exception filter
      (matching the `ErrorResponse` shape in `openapi.yaml`) and Prisma error
      mapping
- [ ] helmet, CORS, global rate limit
- [ ] Swagger UI wired up and non-public outside development
- [ ] Health check / app boots green

**Notes:**

## Phase 3 — Authentication

- [ ] Users module (lookup + creation, password hashing)
- [ ] Sign up, sign in (Passport local + JWT strategy)
- [ ] Email verification endpoint
- [ ] Forgot password / reset password with tokens, plus the stricter rate limit
      on those endpoints
- [ ] Password-change notification email (delivery mechanism may be a stub this
      week; do not block the request on it)
- [ ] Unit tests for every service in this phase

**Notes:**

## Phase 4 — Authorization

- [ ] Role decorator + guard (Manager-only endpoints)
- [ ] CASL ability factory (all rules live here) + policies guard
- [ ] Current-user decorator, guard order verified on a protected route
- [ ] Unit tests for the ability factory and the guards

**Notes:**

## Phase 5 — Products

- [ ] List with pagination + category search, public (logged and non-logged)
- [ ] Detail, with a response shape that does not force one request per row
- [ ] Create (with the optional atomic `variants[]`), update, soft delete
- [ ] Enable / disable
- [ ] Soft-delete and sellability rules applied on every read
- [ ] Unit tests for the service

**Notes:**

## Phase 6 — SKUs / variants

- [ ] List and create under a product
- [ ] Detail, update, soft delete
- [ ] Enable / disable
- [ ] Sellability as an AND across product + variant
- [ ] Unit tests for the service

**Notes:**

## Phase 7 — Images (stretch — move to Week 4 if time runs out)

- [ ] Product and variant image upload/delete endpoints
- [ ] Cover-image rule enforced
- [ ] Storage backend (S3) or a documented placeholder

**Notes:**

## Phase 8 — Close the checkpoint

- [ ] Generated Swagger compared against `openapi.yaml`; differences resolved
      (the spec wins)
- [ ] OWASP checklist pass (`implementation-notes.md` §13)
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:cov` green
- [ ] `CLAUDE.md` scope paragraph updated to match what exists
- [ ] `next-phase.md` updated with anything deferred out of Week 3

**Notes:**
