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

- [ ] Install this week's dependencies: `stripe`, `@nestjs/bullmq` + `bullmq`,
      `@nestjs/schedule`, Testcontainers packages for e2e
- [ ] Redis and a dedicated test database added to the local run story
      (`docker-compose.yml` or documented alternative)
- [ ] `.env`/`.env.example` extended with the Week-4 settings from
      `implementation-notes.md` §3 (Redis, Stripe keys, low-stock threshold,
      cart TTL) and env schema validation updated to fail at boot on missing
      ones
- [ ] Stripe webhook raw-body wiring in `main.ts` (signature verification
      needs the untouched request body, not the JSON-parsed one)
- [ ] E2E harness enabled: `test/app.e2e-spec.ts` back in `tsconfig.json`/
      `eslint.config.mjs`, `vitest.config.e2e.ts` wired to a Testcontainers
      Postgres, `npm run test:e2e` runs green with the starter test

**Notes:**

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

- [ ] `docs/architecture.md`: one production diagram, plus a short rationale
      for the queue decision (BullMQ vs cron vs event, per
      `implementation-notes.md` §11), the deploy shape, and what would be
      monitored in production (challenge's Mandatory Implementations)

**Notes:**

## Phase 9 — Close the block

- [ ] Generated Swagger compared against `openapi.yaml`; differences resolved
      (the spec wins)
- [ ] OWASP checklist pass (`implementation-notes.md` §13)
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`,
      `npm run test:cov` all green
- [ ] `CLAUDE.md` scope paragraph updated to match what exists
- [ ] `docs/next-phase.md` deleted once every item on it is resolved
