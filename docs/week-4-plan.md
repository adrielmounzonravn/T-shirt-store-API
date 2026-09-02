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

- [x] Written before any other Week-4 code changes, by a subagent that does
      not implement the checkpoint's features
- [x] Covers sign up, sign in, email verification, forgot/reset password
      against a real Postgres (Testcontainers), through the real HTTP pipeline
      (guards, pipes, filters included)

**Notes:**
- `test/auth.e2e-spec.ts`: since `.env.test` leaves SMTP blank and
  `MailService` swallows send failures, verification/reset tokens are
  captured via `vi.spyOn` on the app's real `MailService` instance rather
  than a fake inbox.
- `test/auth-throttle.e2e-spec.ts`: the throttle 429 test skipped earlier
  now exists in its own file. `AuthController`'s per-route throttle is a
  module-level constant read from `process.env` at import time, so it can't
  be changed via `overrideProvider` on a compiled testing module — this
  file overrides `THROTTLE_RESET_PASSWORD_LIMIT`/`_TTL` in `beforeAll`
  before a dynamic `import('./e2e/test-app.js')`, relying on Vitest's
  per-file module isolation to keep that override from leaking into
  `.env.test`'s shared `1000` limit used by every other e2e file.

## Phase 1.5 — Real email delivery (SMTP provider)

- [x] Sign up for a free Mailtrap account, create a Sandbox inbox, and copy
      its SMTP credentials
- [x] Set `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD` in the local
      `.env` (not `.env.test` — e2e keeps empty placeholders on purpose, see
      Phase 0 notes)
- [x] Manually trigger the three email flows that already exist — sign-up
      (verification), forgot-password, and password-change — through the
      running app and confirm all three land in the Mailtrap Sandbox inbox
- [x] Document the chosen provider in `implementation-notes.md` §4 (settled
      decisions) so it isn't re-litigated later

**Notes:**
- No code changes expected: `MailService` already wraps a generic
  `nodemailer` SMTP transport (`src/mail/mail.service.ts`), so this phase is
  config-only. E2E tests don't need this — they run with empty SMTP
  credentials and `MailService` swallows send failures, so the auth e2e
  suite (Phase 1) already passes without a real provider.
- Mailtrap Sandbox was chosen over Resend specifically because it's plain
  SMTP with no domain-verification requirement, matching the SMTP-shaped
  config that already exists — Resend would need a verified domain to send
  to arbitrary recipients.
- Full inventory of email cases in this project (only these four —
  `challenge.md`/`openapi.yaml` have no others, e.g. no order-confirmation
  email): email verification, forgot/reset password, password-changed
  notification (all three covered here), and the stock notification
  (Phase 6, MUST per challenge §8, threshold is stock *reaching* 3 — not
  "below 3"). The 4th case is verified manually as part of Phase 6 itself,
  once it's actually built.

## Phase 2 — Liked products and cart

- [x] Like / unlike a product, list liked products
- [x] Cart module: add/remove/update items, one active cart per user
      (`one_active_cart_per_user`), cart expiry rule (`implementation-notes.md`
      §2 — TTL from config, flips `active → expired` before a new cart is
      allowed)
- [x] Unit tests for the services

**Notes:**
- Cart/CartNumber tables, CHECK constraints, and the `one_active_cart_per_user`
  partial index were already present from the initial migration — no new
  migration needed for this phase.

## Phase 3 — Checkout: Payment Links

- [x] `POST` endpoint to generate a Payment Link for a single product
      (challenge §7A) — order created `pending` before redirecting to Stripe
- [x] Unit tests for the service
- [x] E2E: single-product checkout happy path through the Payment Link flow

**Notes:**
- `orders.idempotency_key` was missing from `schema.prisma` (only `db-schema.md`
  had it) — added via a hand-written migration (`prisma migrate diff` against
  the running dev DB, since `migrate dev` refuses to run non-interactively).
- Since Payment Links only accept an existing Stripe `price` id (no inline
  `price_data` like Checkout Sessions), `CheckoutService` creates an ad hoc
  Stripe Price from the variant's current price/currency before creating the
  link, and stores `orderId` in the link's `metadata` for the webhook
  (Phase 4) to correlate later.
- `StripeModule`'s client provider falls back to a placeholder key when
  `STRIPE_SECRET_KEY` is blank (allowed outside production) — the Stripe SDK
  throws on construction with an empty string, which broke app boot in e2e/dev
  once a Stripe-dependent module became eagerly imported.
- `test/checkout.e2e-spec.ts`: no real Stripe test-mode account is configured
  for e2e, so `stripe.prices.create`/`stripe.paymentLinks.create` are stubbed
  via `vi.spyOn` on `app.get(STRIPE_CLIENT)`. Same pattern should be reused
  for the Phase 4 Payment Intent/webhook e2e suite.

## Phase 4 — Checkout: Payment Intents and webhook

- [x] Payment Intent creation for cart checkout (challenge §7B), validating
      stock availability before creating the payment
- [x] `POST /webhooks/stripe` — specced in `openapi.yaml` first
      (`implementation-notes.md` §5), signature verified against the signing
      secret, handles `checkout.session.completed` and
      `payment_intent.succeeded`; this is the only `pending → paid` transition
- [x] Stock decremented and the stock-notification threshold checked on the
      same successful-payment path
- [x] Unit tests for the services
- [x] E2E: cart checkout happy path, plus an unsigned/forged webhook request
      rejected

**Notes:**
- Idempotency for the `pending → paid` transition is a single guarded
  `prisma.order.updateMany({ where: { id, status: pending }, ... })` rather
  than a read-then-write — a replayed event for an already-paid order matches
  zero rows and is silently a no-op, no separate check needed.
- `WebhooksService` decrements stock for every purchased line item once (and
  only once — an idempotent replay with `updateMany` count 0 skips it) the
  `pending → paid` transition actually happens. Reaching the low-stock
  threshold is only logged for now — actually enqueuing the notification is
  deliberately deferred to Phase 6, which owns the BullMQ queue/processor
  setup end to end.
- `POST /checkout/payment-intent` converts the caller's active cart into the
  order (freezing `cart_products.unit_price`, flipping the cart to
  `confirmed`) rather than building an invisible one-off cart like the
  Payment Link flow. `clientSecret` is never persisted (per `openapi.yaml`);
  an idempotency replay re-fetches it via `stripe.paymentIntents.retrieve`
  using the stored `orders.payment_intent` id.
- Unlike Payment Link's `findSellableVariant` (404 on a bad SKU), an
  unsellable/insufficient-stock line in the cart-checkout flow throws
  `ConflictException` (409) for every case — `openapi.yaml`'s
  `/checkout/payment-intent` only documents 401/403/409/422, no 404.
- `test/checkout.e2e-spec.ts` gained a `POST /checkout/payment-intent` suite;
  `test/webhooks.e2e-spec.ts` (new) covers the webhook signature checks and
  idempotency. Signed webhook requests in tests use the real
  `stripe.webhooks.generateTestHeaderString` against `.env.test`'s (empty)
  `STRIPE_WEBHOOK_SECRET` — HMAC verification is symmetric, so this exercises
  real signature checking without a live Stripe secret.
- Found while writing these tests: `POST /me/cart/items` actually responds
  `201`, but its Swagger annotation and `openapi.yaml` both document `200`.
  Left unfixed (test-only task) — worth reconciling in Phase 9's Swagger-vs-
  spec pass.

## Phase 5 — Orders

- [x] Order history: filters (date range, status, price range) + pagination
      (challenge §9)
- [x] Order detail (products, quantities, prices, payment method, total,
      status)
- [x] Manager: advance status `paid → processing → shipped`
- [x] Client: cancel before `shipped`
- [x] Unit tests for the service
- [x] E2E: order history filters/pagination, status advance, cancel-before-
      shipped rejection after `shipped`

**Notes:**
- `GET /orders`: `minPrice`/`maxPrice` filter on the computed `totalAmount`
  (`SUM(unit_price * quantity)` over `cart_products`), which Prisma's query
  builder can't filter/paginate on directly — `OrdersService.findMany` uses
  `$queryRaw` (GROUP BY + HAVING) instead of the persisted-`total_amount`
  fallback `implementation-notes.md` §4 mentions, since the raw query wasn't
  actually awkward once written.
- `PATCH /orders/:orderId/cancel`: added a dedicated `cancel` CASL action
  (granted to clients only) instead of reusing `update` — `PoliciesGuard`
  checks `ability.can(action, 'Order')` by subject type only, with no
  instance, so a shared `update` action would let clients hit the
  manager-only `/status` endpoint too. Ownership (`cart.userId === user.sub`)
  and the shipped/cancelled 422 check are enforced in `OrdersService.cancel`,
  same pattern as `findOne`'s ownership check.
- `test/orders.e2e-spec.ts`: found while writing it — `orders.controller.ts`
  was the only controller with no `ParseUUIDPipe` on its id param, so a
  non-UUID `orderId` fell through to Prisma and came back as an unhandled
  500. Fixed alongside the tests (`ParseUUIDPipe` added to all three
  `:orderId` routes) rather than left as a note, since it's a one-line
  change consistent with every sibling controller.

## Phase 6 — Stock notification job

- [x] BullMQ queue + processor: when a variant's stock reaches the configured
      low-stock threshold, notify by email every user who liked the product
      and hasn't purchased it
- [x] Email includes the product's cover image
- [x] `attempts` + backoff on the job; failures logged via `@OnWorkerEvent('failed')`,
      never swallowed
- [x] Unit tests for the processor/service
- [x] Manually trigger the job against the real Mailtrap SMTP credentials set
      up in Phase 1.5 and confirm the email (with the product's cover image)
      lands in the Mailtrap Sandbox inbox — this is the 4th and last email
      case in the project

**Notes:**

- `bullmq` v6 treats `ioredis` as an optional peer dependency it `require()`s
  lazily; it was never added as a project dependency, so `BullModule` failed
  to connect on every app bootstrap and the failure path spun fast enough to
  OOM within seconds. Added `ioredis` as a dependency, and added a Redis
  Testcontainer to `test/e2e/global-setup.ts` (`@testcontainers/redis`)
  alongside the existing Postgres one, since e2e specs boot a real app.
- Manual trigger: with `docker compose up -d` (postgres + redis) and
  `npm run start:dev` running against the real `.env`, a throwaway script
  added a `likedProduct` row for the seeded client user on a product that has
  a cover image, then pushed a `notify-likers` job straight onto the
  `stock-notification` BullMQ queue with that product's variant id (bypassing
  the webhook path, since no real Stripe checkout is configured). The job
  completed with no `failedReason`, and the email — with the cover image —
  arrived in the Mailtrap Sandbox inbox. Test data was cleaned up afterward.

## Phase 7 — Cron jobs

- [x] Cart expiry sweep (`@nestjs/schedule`)
- [x] Reset-token cleanup (deletes rows where `used_at IS NULL AND expires_at
      < now()`)
- [x] Unit tests for the pure logic each job runs

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

- [x] Generated Swagger compared against `openapi.yaml`; differences resolved
      (the spec wins)
- [ ] OWASP checklist pass (`implementation-notes.md` §13)
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`,
      `npm run test:cov` all green
- [ ] `CLAUDE.md` scope paragraph updated to match what exists
- [x] `docs/next-phase.md` deleted once every item on it is resolved (done in
      Phase 0 — the e2e setup exclusions were its only remaining item)

**Notes:**
- Swagger-vs-spec pass found one remaining gap after the earlier commits
  (cart-items status code, signin schema, webhook annotations/tag, optional-
  auth on `GET /products*`, integer types): `PATCH /orders/{orderId}/status`
  and `PATCH /orders/{orderId}/cancel` document 401/403/422 but not 404 in
  `openapi.yaml`, even though `OrdersService.advanceStatus`/`cancel` both
  throw `NotFoundException` for an unknown `orderId` (same as `findOne`,
  which already documents 404) and the controller's `@ApiErrorResponses`
  already includes it. Since the 404 behavior is real and intentional, the
  spec was updated to add it rather than removing it from the code.
