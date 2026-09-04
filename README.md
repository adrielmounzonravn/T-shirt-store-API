# T-Shirt Store API

A REST API for an online t-shirt store: authentication with email verification and
password reset, role-based authorization (client / manager), a product catalog with
size/color/fit/gender variants (SKUs) and image upload, liked products with low-stock
notifications, a shopping cart with expiry, Stripe checkout (Payment Links and Payment
Intents) with webhook-driven order status, and order history with filters and pagination.

**Stack:** NestJS 12, TypeScript (ESM), Prisma 7 + PostgreSQL 17, Passport (JWT + local),
CASL for authorization, BullMQ + Redis for background jobs, `@nestjs/schedule` for cron
jobs, Stripe, AWS S3, Nodemailer, Swagger, Vitest + Testcontainers.

---

## Quick start

Everything below is the primary review path: a local clone running against Docker
Postgres + Redis. It works end to end with no third-party accounts.

### Prerequisites

- **Node.js** — the version is pinned in `.nvmrc` (`v26.5.0`); with nvm, run `nvm use`.
- **Docker** (with Compose) — for Postgres and Redis, and for the e2e test suite.

### 1. Clone and install

```bash
git clone https://github.com/adrielmounzonravn/T-shirt-store-API.git
cd T-shirt-store-API
npm install
```

`npm install` runs `prisma generate` via `postinstall`, which generates the Prisma client
into `src/generated/prisma` (gitignored).

### 2. Create your `.env`

```bash
cp .env.example .env
```

**This step is required.** `src/config/env.validation.ts` validates the environment with
Joi and marks around twenty variables as required with no defaults (`CART_TTL_HOURS`,
`JWT_SECRET`, `CORS_ALLOWED_ORIGINS`, the four `THROTTLE_*` vars, `REDIS_HOST`/`REDIS_PORT`,
`QUEUE_*`, `STRIPE_SUCCESS_URL`/`STRIPE_CANCEL_URL`/`STRIPE_CURRENCY`, `S3_BUCKET`/`S3_REGION`,
`SMTP_PORT`, `SMTP_FROM`, …). A missing or malformed variable stops the process at boot
rather than surfacing as a runtime error later. The checked-in `.env.example` contains a
complete, valid development set, so a plain copy is enough.

**Nothing in `.env.example` needs to change to review the API.** Three feature areas call
third-party services, and those are the only places you supply your own credentials:

| Area | With the placeholder `.env` | To exercise it |
| --- | --- | --- |
| **Email** (verification, password reset, password changed, low stock) | `SMTP_HOST` is empty, so no mail is sent; each send fails, is caught and logged, and the request itself still succeeds. | Your own SMTP credentials (a free Mailtrap sandbox works): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`. |
| **Image upload** (`POST /products/:productId/images`, `POST /variants/:skuId/images`) | `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` are empty, so uploads to S3 fail. Every other catalog endpoint is unaffected. | Your own S3 bucket plus `S3_BUCKET`, `S3_REGION` and an IAM key pair. |
| **Checkout / webhook** | `STRIPE_SECRET_KEY` is a placeholder, so calls to Stripe fail. | Your own Stripe **test-mode** keys; see [Testing payments](#testing-payments). |

Because no mail is delivered under the placeholder `.env`, sign in with the
[seeded accounts](#seed-data--demo-accounts) — they are pre-verified and ready to use
immediately. See [Email and account verification](#email-and-account-verification).

### 3. Start Postgres and Redis

```bash
docker compose up -d
```

`docker-compose.yml` starts two services, matching the URLs already in `.env.example`:

- **postgres** — `postgres:17-alpine` on `localhost:5432` (user / password / database all
  `tshirt_store`), persisted in the `postgres_data` volume.
- **redis** — `redis:7-alpine` on `localhost:6379`, persisted in `redis_data`.

Redis is required: BullMQ backs the low-stock notification queue, and the app connects to
Redis on boot.

`docker compose down -v` wipes both volumes.

### 4. Apply migrations

```bash
npx prisma migrate deploy
```

`postinstall` only generates the client — it does not touch the database. This command
applies everything in `prisma/migrations/`. Some migrations are hand-edited to add partial
indexes and CHECK constraints Prisma cannot express, so always use `migrate deploy`, never
`db push`.

### 5. Seed demo data

```bash
npm run db:seed
```

Creates the two demo accounts and a catalog of eight products with 23 variants. See
[Seed data](#seed-data--demo-accounts).

### 6. Run the API

```bash
npm run start:dev
```

The API listens on `http://localhost:3000`. `GET /health` checks the database connection
and returns `{ "status": "ok" }`.

---

## API documentation

- **Swagger UI: <http://localhost:3000/docs>** while running locally. This is the fastest
  way to review every endpoint: it is fully annotated, and `Authorize` accepts a bearer
  token (paste the `accessToken` from `POST /auth/signin`) which persists across requests.
- **`docs/openapi.yaml`** — the checked-in contract the implementation is written against.
  Import it into Postman, Insomnia, Bruno or any OpenAPI client if you prefer that over
  Swagger UI.

Swagger is mounted **only when `NODE_ENV === 'development'`** (see `src/main.ts`). That is a
security decision: the deployed instance exposes no `/docs` surface, and its
Content-Security-Policy stays strict instead of being relaxed for Swagger's inline scripts.
Review the interactive docs locally, and read the deployed contract from `openapi.yaml`.

---

## Seed data / demo accounts

`npm run db:seed` creates these **local demo accounts** for development against your own
database:

| Email | Password | Role |
| --- | --- | --- |
| `manager@tshirtstore.dev` | `Manager123!` | `manager` |
| `client@tshirtstore.dev` | `Client123!` | `client` |

Both are created with `isVerified: true`, so either one can call `POST /auth/signin`
immediately — no email step needed. Use the manager account for catalog management and
order-status transitions, and the client account for cart, likes, checkout and order
history.

The seed also creates a catalog of **eight products with 23 variants**, shaped so every
rule and edge case is reachable without setting anything up:

- Every value of the `gender`, `size`, `color` and `fit` filters returns at least one
  sellable variant, so no catalog filter comes back empty.
- **One variant sits exactly at `LOW_STOCK_THRESHOLD`** (Classic Cotton Tee, xs/gray) and two
  sit one unit above it (Everyday V-Neck xl/white, Linen Blend Pocket Tee xs/blue), so a
  single purchase trips the low-stock notification.
- **One variant is out of stock** (Oversized Graphic Tee, xxl/black) to exercise the
  out-of-stock path.
- **One product is disabled** (Vintage Wash Tee) and **one variant is disabled**
  (Heavyweight Boxy Tee, m/red/oversize), so the sellability rules and the manager-only
  disabled-product filter are both demonstrable.
- No product images are seeded, since image upload runs against your own S3 credentials.

The seed is idempotent: products and variants are upserted by fixed ids, so running it twice
changes nothing and re-running it restores the catalog to this exact state.

---

## Email and account verification

The API sends four emails: address verification on signup, password reset, a
password-changed notification, and a low-stock notification to users who liked a product
whose stock drops to the `LOW_STOCK_THRESHOLD`.

Under the placeholder `.env`, `SMTP_HOST` is empty and **no mail is delivered**. Every send
in `src/mail/mail.service.ts` is wrapped in try/catch: the failure is logged through the
Nest logger and the HTTP request that triggered it still succeeds, so a missing mailer never
breaks an endpoint.

`POST /auth/signin` accepts verified accounts only, so a freshly registered account cannot
sign in until its verification token has been delivered and posted back. Two paths:

1. **Use the seeded accounts above** — they are pre-verified and ready to sign in
   immediately. This is the shortest route through the whole API.
2. **Configure your own SMTP** in `.env` (a free Mailtrap sandbox inbox takes a minute to
   set up), restart the app, then sign up: the verification token arrives by mail and you
   post it to `POST /auth/verify-email`. The same applies to the
   `POST /auth/forgot-password` → `POST /auth/reset-password` pair, which delivers its token
   by email too.

---

## Testing payments

Checkout runs against **your own Stripe test-mode secret key** (free to create at
dashboard.stripe.com; no activated account needed for test mode). Put it in `.env` as
`STRIPE_SECRET_KEY` and restart. No key is committed to this repo, and none is needed for
any other part of the review.

Both checkout endpoints require an **`Idempotency-Key` request header containing a UUID**
(see `src/checkout/checkout.controller.ts`); a missing or non-UUID value is a `400`. Replaying
the same key returns the original result instead of creating a second order.

**`POST /checkout/payment-link`** — quick single-SKU purchase. Creates an invisible cart, a
`pending` order, and a Stripe Payment Link. The response contains a Stripe-hosted URL: open
it in a browser and pay there. After payment, Stripe redirects the browser to
`GET /checkout/success` (or `/checkout/cancel` if you cancel) — both are public routes that
just return a plain `{ "message": "..." }` JSON confirmation, since this is a backend API
and not a full webapp.

**`POST /checkout/payment-intent`** — checks out the authenticated user's active cart.
Validates stock on every line, computes the total, confirms the cart as a `pending` order,
and returns a `client_secret` for a Stripe.js / Elements frontend to confirm. This repo is
the API only, so the Payment Link path is the one you can drive from a browser alone.

Use Stripe's standard test card numbers, documented in Stripe's own testing docs
(`docs.stripe.com/testing`); none are reproduced here.

**The webhook is what moves an order from `pending` to `paid`.** Stripe cannot reach
`localhost`, so forward events with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

`stripe listen` prints a webhook signing secret — put it in `.env` as
`STRIPE_WEBHOOK_SECRET` and restart the app, because `POST /webhooks/stripe` verifies the
`Stripe-Signature` header and rejects unsigned requests. With the forwarder running, a
completed payment settles the order; without it, the order stays `pending`.

From `paid`, a manager advances the order through `processing` → `shipped` via
`PATCH /orders/:orderId/status`; `PATCH /orders/:orderId/cancel` cancels one.

---

## Running the tests

```bash
npm test              # unit tests — all *.spec.ts, via vitest
npm run test:watch    # unit tests in watch mode
npm run test:cov      # unit tests with coverage
npm run test:e2e      # end-to-end tests (requires Docker)
```

The e2e suite (`test/*.e2e-spec.ts`) runs against a **real PostgreSQL** — never a mock or
in-memory substitute. `test/e2e/global-setup.ts` starts a `postgres:17-alpine`
Testcontainer once per run, points `DATABASE_URL` at it and applies migrations with
`prisma migrate deploy`; the remaining variables come from the checked-in `.env.test`, which
holds only safe placeholders. **Docker must be running.**

E2E coverage targets the critical paths: **authentication** (`auth.e2e-spec.ts`,
`auth-throttle.e2e-spec.ts`), **checkout** (`checkout.e2e-spec.ts`,
`webhooks.e2e-spec.ts`) and **order history** (`orders.e2e-spec.ts`).

Other useful commands:

```bash
npm run lint          # eslint --fix over src/ and test/
npm run format        # prettier --write over src/ and test/
npm run typecheck     # tsc --noEmit
npm run build         # nest build
```

---

## Project structure

```
src/
  auth/               signup, signin, email verification, password reset; Passport JWT + local strategies and guards
  casl/               CASL ability factory, PoliciesGuard, @CheckPolicies decorator
  users/              user records; reset-token cleanup cron
  products/           product CRUD, enable/disable, listing with filters; product images
  variants/           SKU CRUD, enable/disable, stock and price; variant images
  liked-products/     GET/PUT/DELETE under /me/liked-products
  cart/               active cart and its items under /me/cart; cart-expiry cron
  checkout/           Stripe Payment Link and Payment Intent flows, idempotency
  stripe/             thin Stripe SDK wrapper
  webhooks/           POST /webhooks/stripe, signature verification, order state transitions
  orders/             order history with filters and pagination, status transitions, cancel
  stock-notification/ BullMQ queue + worker for low-stock emails to users who liked a product
  mail/               Nodemailer transport and the four transactional emails
  storage/            S3 client and upload/delete helpers for images
  health/             GET /health database liveness check
  common/             shared DTOs, decorators, filters, interceptors
  config/             configuration factory and the Joi env schema
  prisma/             PrismaService (Prisma 7 with the pg adapter)
prisma/               schema.prisma, hand-edited migrations, seed.ts
scripts/              SQL helpers for administering the deployed instance
test/                 e2e specs plus the shared Testcontainers setup and app helpers
docs/                 design docs (below)
```

Two cron jobs run hourly on `@nestjs/schedule`: the cart-expiry sweep
(`src/cart/cart-expiry.cron.ts`, using `CART_TTL_HOURS`) and reset-token cleanup
(`src/users/reset-token-cleanup.cron.ts`).

A note for anyone reading the source: `package.json` sets `"type": "module"` and TypeScript
uses `nodenext` resolution, so relative imports carry a `.js` extension
(`from './app.service.js'`), as that resolution mode requires.

---

## Documentation

Read in this order:

| Document | What it is |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | The architecture write-up: request pipeline, production topology diagram, why the low-stock job is a queue and the sweeps are cron, the deploy shape, and the observability plan. **Start here.** |
| [`docs/openapi.yaml`](docs/openapi.yaml) | The HTTP contract the implementation is written against — importable into any OpenAPI client. |
| [`docs/db-schema.md`](docs/db-schema.md) | The data model in DBML, plus the rules the schema cannot express and that application code enforces (soft-delete filtering, SKU sellability, …). |
| [`docs/implementation-notes.md`](docs/implementation-notes.md) | DBML→Prisma gaps hand-added to migrations, background jobs, env config, and a log of settled decisions. Part B maps the course material onto the project. |
| [`docs/challenge.md`](docs/challenge.md) | The original requirements, including the roles/CASL ability matrix and the **Scope** section listing what is deliberately excluded (delivery-person role, `delivered` status, promo codes). |

`CLAUDE.md` documents the repository's own working conventions.

---

## Deployment (extra credit)

A deployed instance runs at **<https://t-shirt-store-api.onrender.com>**. The local setup
above is the intended review path; this instance is there to show the deploy shape working.

- It runs on Render's free tier, which sleeps the instance when idle, so the first request
  after a period of inactivity can take around 40 seconds to answer while it starts up.
- **`/docs` is not exposed there** — Swagger is development-only by design (see
  [API documentation](#api-documentation)); read [`docs/openapi.yaml`](docs/openapi.yaml)
  for the deployed contract.
- Endpoints reachable without authentication: `GET /health`, `GET /products`,
  `GET /products/:productId`. Everything else needs a bearer token from an account on that
  instance.
