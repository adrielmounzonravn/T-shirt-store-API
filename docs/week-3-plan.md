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
- [x] Env schema validation that fails at boot
- [x] Enable the Swagger CLI plugin in `nest-cli.json`

**Notes:**

- `@nestjs/config` 12.x's `validationSchema` expects a Standard Schema
  (https://standardschema.dev), not a raw Joi call — Joi 18 implements it
  natively, so `Joi.object({...})` still works, but Joi-specific options (e.g.
  `abortEarly`) must be passed as `validationOptions: { libraryOptions: {...} }`,
  not flat.
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

- [x] Translate the DBML into `schema.prisma`
- [x] First migration, hand-edited with the partial indexes and CHECK
      constraints from `implementation-notes.md` §1
- [x] Migration applies from scratch on a clean database
- [x] Seed script (a manager, a client, a couple of products/variants)

**Notes:**

- Prisma 7 requires an explicit driver adapter (or Accelerate URL) passed to
  `new PrismaClient({ adapter })` — there is no more implicit `DATABASE_URL`
  pickup. Added `@prisma/adapter-pg` + `pg`; `PrismaService` in Phase 2 must
  construct the client the same way.
- Seed script runs via `tsx` (added as a dev dependency), not plain `node`:
  the generated Prisma client's own files use `.js`-extension imports meant
  for `tsc` output, which breaks under Node's native TS type-stripping.
  Configured in `prisma7.config.ts`'s `migrations.seed`; run with
  `npx prisma db seed` or `npm run db:seed`.
- Seed data: `manager@tshirtstore.dev` / `client@tshirtstore.dev` (both
  pre-verified), two enabled products with two enabled variants each. Upserts
  by email / guards on product name, so re-running is a no-op.

## Phase 2 — Application shell

- [x] `PrismaModule` / `PrismaService` + shutdown hooks
- [x] Global validation pipe, serialization interceptor, exception filter
      (matching the `ErrorResponse` shape in `openapi.yaml`) and Prisma error
      mapping
- [x] helmet, CORS, global rate limit
- [x] Swagger UI wired up and non-public outside development
- [x] Health check / app boots green

**Notes:**

- Diverged from `implementation-notes.md` §13's "basic auth behind a
  `NODE_ENV` check": no basic-auth package or Swagger credentials are
  configured anywhere in `docs/`, so instead `SwaggerModule.setup` (mounted at
  `/docs`) is only called when `nodeEnv === 'development'` — outside that it
  isn't mounted at all, which already satisfies "non-public outside
  development". Revisit if a later session wants it reachable (behind auth)
  in `production`/`test` too.
- `@nestjs/terminus` doesn't declare a compatible peer range for
  `@nestjs/common`/`core` 12.x yet, so `GET /health` is a plain
  `HealthController` (checks DB connectivity via `PrismaService.$queryRaw`)
  instead. Excluded from Swagger (`@ApiExcludeController`) since it isn't in
  `openapi.yaml`.

## Phase 3 — Authentication

- [x] Users module (lookup + creation, password hashing)
- [x] Sign up, sign in (Passport local + JWT strategy)
- [x] Email verification endpoint
- [x] Forgot password / reset password with tokens, plus the stricter rate limit
      on those endpoints
- [x] Password-change notification email (delivery mechanism may be a stub this
      week; do not block the request on it)
- [x] Unit tests for every service in this phase

**Notes:**

- Email verification uses a short-lived, stateless JWT (`{ sub, purpose:
  'email-verification' }`, TTL from `EMAIL_VERIFICATION_TOKEN_TTL_HOURS`) —
  not `users_auth`, which stays reserved for password-reset tokens only per
  `db-schema.md`. It's verified by signature + expiry, no DB round-trip; a
  used token is rejected because `verifyEmail` checks `user.isVerified` and
  401s if already true, so it never needs its own single-use tracking.
- `MailService` (new `src/mail/` module, wraps `nodemailer`) swallows send
  failures (logs, doesn't throw) so signup never blocks on SMTP — no queue
  infra (BullMQ) introduced yet for this. Revisit if/when a queue is added for
  the password-change email too.
- Reset tokens: a random raw token (`crypto.randomBytes`) is emailed, and only
  its SHA-256 hash is persisted to `users_auth.token` — bcrypt (used for
  passwords) is intentionally not used here since its salting breaks the
  `WHERE token = ?` equality lookup `db-schema.md` assumes.
- `@Throttle()`'s per-route override values are static at decorator/import
  time, evaluated before `ConfigModule.forRoot()` would load `.env` — so
  `main.ts` now preloads `dotenv/config` as its first import. Needed by any
  future route using an env-driven stricter throttle limit, not just this one.
- The password-change notification email (next checklist line) is sent from
  inside `resetPassword` itself, since that's the only password-change path
  that exists yet.

## Phase 4 — Authorization

- [x] Role decorator + guard (Manager-only endpoints)
- [x] CASL ability factory (all rules live here) + policies guard
- [x] Current-user decorator, guard order verified on a protected route
- [x] Unit tests for the ability factory and the guards

**Notes:**

## Phase 5 — Products

- [x] List with pagination + category search, public (logged and non-logged)
- [ ] Detail, with a response shape that does not force one request per row
- [ ] Create (with the optional atomic `variants[]`), update, soft delete
- [ ] Enable / disable
- [ ] Soft-delete and sellability rules applied on every read
- [ ] Unit tests for the service

**Notes:**

- `@nestjs/swagger`'s CLI plugin (12.0.0) generates a broken (non-`async`)
  `await import()` for any class whose property is typed as another exported
  class from a different file, under this repo's ESM output — breaks at
  runtime with `SyntaxError: Unexpected reserved word`. Bumped to `12.0.1`
  (`--legacy-peer-deps`, same as `@nestjs/throttler`), which hoists the
  dynamic import instead. Affects any future nested response entity
  (`ProductDetail.variants[]`, `Order` lines, etc.) — keep this version pin.
- `GET /products` is public but optionally authenticated (`security: [{},
  bearerAuth: []]`): added `OptionalJwtAuthGuard` (`src/auth/guards/`), which
  swallows the missing/invalid-token case instead of 401ing, so a logged-in
  Manager can still use the `status` filter. Only Manager may see/filter
  `disabled` products; everyone else is clamped to `status: enabled`
  regardless of the query param — enforced in `ProductsService`, not CASL
  (role-shaped check, not ownership-shaped).
- Found and fixed a pre-existing bug (unrelated to Products, present since
  Phase 3): `AuthModule` imported bare `PassportModule` instead of
  `PassportModule.register({})`, so `AuthModuleOptions` was never provided and
  the app crashed at boot (`UnknownDependenciesException` on `LocalAuthGuard`)
  the first time anyone actually ran `npm run start:dev` end-to-end. Any
  module using `AuthGuard()` (including `ProductsModule`) needs its own
  `PassportModule.register({})` import too, since `AuthModule` exports
  nothing.
- "Category" has no dedicated entity — `gender`/`size`/`fit`/`color` filter on
  the product's non-soft-deleted `variants` via a Prisma `variants.some(...)`
  relation filter, per `openapi.yaml`'s description on `GET /products`.

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
