# Implementation notes — T-Shirt Store API

Everything that belongs neither to the data model (`db-schema.md`) nor to the
HTTP contract (`openapi.yaml`): how to get the schema into Prisma, what runs
outside a request, which design questions are already settled, and **which
course material to lean on for each part of the build**.

Read order for someone new: `challenge.md` → `db-schema.md` → `openapi.yaml` →
this file.

The file has two parts:

- **Part A (§1–§5)** — decisions and mechanics specific to this repo.
- **Part B (§6–§13)** — the course material the tutors provided, mapped onto
  this project: what to apply, where to look it up, and where we deliberately
  diverge.

---

# Part A — This repo

## 1. Getting the schema into Prisma

Most of the DBML maps 1:1 to `schema.prisma`. Three things do not, and must be
written by hand into a migration generated with:

```bash
npx prisma migrate dev --create-only --name <name>
```

**Partial indexes** — Prisma has no syntax for `WHERE` on an index:

```sql
CREATE UNIQUE INDEX one_active_combo_per_product
  ON product_variants(product_id, size, color, fit, gender) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX one_active_cart_per_user
  ON cart_numbers(user_id) WHERE status = 'active';

CREATE UNIQUE INDEX one_cover_image_per_product
  ON product_images(product_id) WHERE is_cover = true;

CREATE UNIQUE INDEX one_cover_image_per_sku
  ON variant_images(sku_id) WHERE is_cover = true;

CREATE UNIQUE INDEX one_unused_token_lookup
  ON users_auth(token) WHERE used_at IS NULL;

CREATE INDEX users_auth_expires_at_idx
  ON users_auth(expires_at) WHERE used_at IS NULL;
```

**CHECK constraints** — no native Prisma attribute either:

```sql
ALTER TABLE product_variants ADD CONSTRAINT chk_stock_non_negative  CHECK (stock >= 0);
ALTER TABLE product_variants ADD CONSTRAINT chk_price_positive      CHECK (price > 0);
ALTER TABLE cart_products    ADD CONSTRAINT chk_quantity_positive   CHECK (quantity > 0);
ALTER TABLE cart_products    ADD CONSTRAINT chk_unit_price_positive CHECK (unit_price IS NULL OR unit_price > 0);
```

**FK indexes** — Postgres indexes the PK, never the FK columns. These are on hot
read paths and do belong in `schema.prisma`:

```prisma
@@index([userId])     // cart_numbers — order history per client (filters + pagination)
@@index([productId])  // product_images — read on every public product detail
@@index([skuId])      // variant_images — idem
```

## 2. Work that happens outside a request

Which mechanism for which job is settled in §11 — the short version: **queue**
when the work must survive a restart or be retried, **cron** when it is a clock
sweep, **event** never for anything that must not be lost.

**Cart expiry.** A cart is `active` for a fixed TTL of 48h. A job (cron, or a
lazy check when a cart is created/read) flips `active → expired` once
`expires_at < now()`. This must run *before* a new cart is allowed for that user,
otherwise `one_active_cart_per_user` rejects the insert.

**Stock notification (challenge §8).** When a variant's stock drops to 3, notify
by email every user who liked the product but has not purchased it. Queue-based
(BullMQ or equivalent), never inline in the request that decremented the stock.
The email includes the product image — build the URL from the S3 key of the
image with `is_cover = true`.

**Password-reset token cleanup.** Deletes rows where
`used_at IS NULL AND expires_at < now()`; `users_auth_expires_at_idx` keeps it
off a table scan.

**Password-change email.** Sending it is a request-triggered side effect, but it
belongs on the same queue so a mail failure never fails the password change.

## 3. Configuration

Values referenced by the schema and the spec that must come from validated env
vars (challenge: "schema validation for environment variables" — see §9 for the
`ConfigModule` shape):

| Setting | Value | Used by |
|---|---|---|
| Cart TTL | 48h | `cart_numbers.expires_at` |
| Reset-token lifetime | short (e.g. 1h) | `users_auth.expires_at`; also defines `created_at`, which is not stored |
| Low-stock threshold | 3 | stock notification job |
| bcrypt cost (salt rounds) | 10 | password hashing (§8) |
| JWT secret + expiry | — | `JwtStrategy`, sign-in |
| CORS allowed origins | explicit list | `app.enableCors` (§10) |
| Rate limit: global / reset-password | e.g. 60s·20 / 60s·5 | `ThrottlerModule` + `@Throttle` (§10) |
| Redis host/port | — | BullMQ (§11) |
| S3 bucket + region + key layout | `products/{product_id}/{image_id}.{ext}`, `variants/{sku_id}/{image_id}.{ext}` | image upload |

Also mandatory per the challenge: helmet, CORS, and a rate limit specifically on
the password-reset endpoints.

## 4. Settled decisions — do not re-litigate

These were argued and closed. Reopen only with new information.

### Domain and contract

- **Stateless JWT, no sessions table.** Sign-out is client-side; there is no
  `POST /auth/signout`. Accepted cost: no server-side revocation before the
  token expires — the exact trade-off the security course states for JWT vs
  sessions, taken deliberately.
- **`POST /products` takes an optional `variants[]`.** Creating a sellable
  product used to be three non-atomic calls (create → add variants → enable),
  which could leave an orphan product with no SKUs. With `variants[]` present,
  product and SKUs are created in one transaction and the product is born
  `enabled`; without it, the old behaviour is unchanged and it is born
  `disabled`. A separate composite-create endpoint was rejected as duplicated
  validation. Images stay a separate `multipart/form-data` call — the win is
  atomicity of product+SKU, not one-call setup.
- **`/me` prefix rule.** Stated in `info.description` of the spec and repeated as
  comments in the affected sections. `/me/orders` for Managers was rejected:
  `GET /orders?userId=` already covers it, and nothing in the domain lets a
  Manager buy, so it would always return empty.
- **`enable`/`disable` stay as four separate endpoints.** A blind `toggle` is not
  idempotent — a network-timeout retry inverts the state instead of confirming
  it. Folding `status` into the existing `PATCH` would be the better cleanup, but
  it was deliberately not done.
- **Cover image is explicit (`is_cover`), not derived** from "oldest image":
  two images inserted in the same statement share a timestamp, and the Manager
  should be able to choose.
- **`total_amount` is computed, not stored.** If the price-range filter on order
  history (challenge §9) turns out to be awkward as a query, persisting it is the
  fallback — not needed now.
- **No `sku_code`.** A human-readable `RED-L-SLIM-MEN` code was considered and
  left out: purely cosmetic, nothing in the challenge needs it.
- **Optional features are out of scope.** Delivery-person role, the `delivered`
  status, full status history, and promo codes are not in the schema or the spec.
  Adding any of them later means new tables plus new CASL abilities.

### Course-material decisions (see §13 for the full reasoning)

- **No URI versioning (`/v1`).** The REST course recommends URI versioning as
  the default; it also says versioning is a last resort. This spec has exactly
  one consumer and nothing published as v1, so paths stay unversioned. Revisit
  only when a real second consumer exists.
- **`openapi.yaml` stays the contract; generated Swagger is a check on it.**
  Not the other way round.
- **Vitest, not Jest.** The testing course is written in Jest; this repo runs
  Vitest. The NestJS testing pieces are identical; only the mock API changes
  (translation table in §12).

## 5. Known gap

`POST /webhooks/stripe` is not yet in `openapi.yaml`. It is the only transition
from `pending → paid` (`checkout.session.completed` for Payment Links,
`payment_intent.succeeded` for Payment Intents) and is mandatory per challenge
§7 — it must be specced and implemented alongside the Stripe integration.

---

# Part B — Course material applied to this project

The seven courses below are the material the tutors provided for this
challenge. Treat them as the **default** answer: when a course covers the
problem, use its approach rather than inventing one. This is a *should*, not
a *must* — where a case is clearly not what the course was solving, or where
this repo has a better option, §13 records the divergence instead of forcing
the fit.

Base path for every reference below:

```
~/webapp/src/content/cursos/backend/
```

Each `modulo.mdx` opens with a *Vistazo* — a one-screen summary. Read that first;
drop into the individual topic only when implementing that exact piece.

## 6. The courses at a glance

| Course (directory) | Settles for this project |
|---|---|
| `diseno-de-apis-rest` | Resource naming, HTTP verbs, status codes, idempotency, what counts as a breaking change, N+1 in the response shape |
| `fundamentos-de-nestjs` | Module/provider layout, DI, config, DTO validation, serialization, guards/interceptors/filters, the `PrismaService` pattern |
| `seguridad-en-nestjs` | Request-pipeline order, Passport+JWT, RBAC vs CASL, bcrypt, CORS/helmet/throttler, OWASP mapping |
| `nestjs-documentacion-y-tareas-en-segundo-plano` | `@nestjs/swagger`, `@nestjs/schedule`, BullMQ, `event-emitter`, `Logger`, `HttpModule` |
| `testing-unitario-y-tdd` | What a good unit test is, Jest matchers/mocks, `Test.createTestingModule`, TDD cycle, Given/When/Then |
| `pagos-e-integraciones` | Payment Link vs PaymentIntent (which one, when), verifying the Stripe webhook signature before trusting the body, testing webhooks locally with the Stripe CLI, `FileInterceptor` + S3 (already applied in Week 3) |
| `e2e-cicd-y-observabilidad` | `Supertest` against a real `INestApplication` for e2e, Testcontainers instead of an in-memory DB for the e2e Postgres — CI/CD (GitHub Actions) and OpenTelemetry-based observability are in the same course but not required by `challenge.md`, beyond the "what to monitor" line in the architecture write-up |

`pagos-e-integraciones` and `e2e-cicd-y-observabilidad` are now in scope for
this checkpoint (Stripe/webhooks and the e2e requirement land in Week 4) — see
`docs/week-4-plan.md`.

## 7. Where each rule goes in the request pipeline

`seguridad-en-nestjs/01-ciclo-de-vida-de-la-request/01-orden-de-ejecucion.mdx`
and `fundamentos-de-nestjs/05-guards-interceptors-y-filtros/`.

```
Middleware  → Guards → Interceptors (pre) → Pipes
            → Controller → Service
            → Interceptors (post) → Exception Filters (on throw, from anywhere)
```

The course's point is that security rarely fails by picking the wrong mechanism
— it fails by putting it at the wrong point in that line. For this repo:

| Concern | Goes in | Why |
|---|---|---|
| Helmet, request logging | Middleware | No handler context needed |
| JWT verification | Guard | First stage with `ExecutionContext` |
| CASL ability check | Guard (after auth) | Needs `request.user`, and the loaded resource |
| Rate limiting | Guard (`ThrottlerGuard` as `APP_GUARD`) | Same reason |
| DTO shape / query coercion | Pipe (`ValidationPipe`) | Shape, never permissions |
| `passwordHash` stripping | Interceptor (`ClassSerializerInterceptor`) | Runs on the way out |
| Uniform error body | Global exception filter | Only stage that sees failures from the whole line |

Explicit anti-pattern the course names and this repo must avoid: authorization
logic inside a Pipe, or ownership checks scattered as `if (x.userId !== user.id)`
across services.

## 8. Authentication and password handling

`seguridad-en-nestjs/02-autenticacion/01-estrategias-de-autenticacion.mdx`,
`seguridad-en-nestjs/04-hashing-y-cifrado/01-hashing-y-cifrado.mdx`.

- **Passport, not a hand-rolled guard.** `@nestjs/passport` +
  `LocalStrategy` (sign-in only, once) + `JwtStrategy` (every protected
  request). `AuthGuard('jwt')` is the guard; whatever `validate()` returns lands
  on `request.user`.
- **The asymmetry matters here**: `local` touches the DB and compares a
  password; `jwt` only verifies a signature. `/auth/signin` is the only endpoint
  that pays the first cost.
- **JWT payload is readable by anyone** — signed, not encrypted. Keep it to
  `{ sub, role, iat, exp }`. No email-adjacent PII, nothing secret.
- **bcrypt, `hash` + `compare`, never `===`.** The salt lives inside the hash
  string; re-hashing and string-comparing is the classic bug the course calls
  out. Cost from config (§3).
- **Hashing vs encryption**: the reset token in `users_auth` is a *lookup* value
  — nothing in this project needs reversible encryption, so `crypto` /
  `createCipheriv` from the course's second half stays unused.

Watch-item, not a course topic: `bcrypt` is a native module and this package is
ESM (`"type": "module"`). If the import shape fights the ESM setup, `bcryptjs`
or `argon2` are acceptable substitutes — the course names `argon2` as the other
recommended option.

## 9. Authorization: RBAC and CASL

`seguridad-en-nestjs/03-autorizacion/01-rbac-basico.mdx` and
`02-casl-y-permisos-por-atributos.mdx`.

The challenge mandates CASL (§6 of `challenge.md`), and the course explains
exactly why RBAC alone is not enough: "Manager can manage products" is a role
question, but "this Client can only see *their own* order" is a condition on the
resource. Both patterns are needed:

- **RBAC** for the role-shaped half: a `@Roles()`-style decorator built on
  `SetMetadata`, read in a guard via `Reflector`. Manager-only endpoints
  (`POST/PATCH/DELETE /products`, `PATCH /orders/{id}/status`) are pure role
  checks.
- **CASL** for the ownership half: a `CaslAbilityFactory` provider that builds
  one `Ability` per user, and a `PoliciesGuard` that evaluates it. Rules like
  `can('update', 'Order', { userId: user.id })` are the whole reason CASL is in
  the challenge.
- **Guard order is not cosmetic.** `@UseGuards(AuthGuard('jwt'), PoliciesGuard)`
  — reversed, `request.user` is `undefined` and the comparison silently
  misbehaves.
- **A CASL check needs the resource loaded.** For `/orders/{orderId}`,
  `/me/cart/items/{skuId}` and cancel, the guard either loads the row itself or
  runs after something that did. The course states this explicitly; it is the
  one place where "authorize before touching the DB" does not hold.
- **All rules live in the factory**, not in services. When "Managers may also
  cancel" arrives, that is one edit.

## 10. Nest structure, input/output, and HTTP hardening

### Modules, providers, Prisma

`fundamentos-de-nestjs/02-modulos-y-providers/`, `03-providers-avanzados-y-scopes/`,
`06-conectando-con-prisma/`.

- **Feature modules by domain**, not by layer: `AuthModule`, `ProductsModule`,
  `VariantsModule` (plus `PrismaModule`, `CaslModule`). `exports` is the real
  boundary — what is not exported stays private.
- **`PrismaService extends PrismaClient`** with `onModuleInit` → `$connect()`
  and `onModuleDestroy` → `$disconnect()`, in its own `PrismaModule` with
  `exports: [PrismaService]`. The explicit `$connect()` is what makes a bad
  `DATABASE_URL` fail at boot instead of on the first user request. Import from
  `src/generated/prisma` (see `CLAUDE.md`), not `@prisma/client`.
  `app.enableShutdownHooks()` in `main.ts` or the destroy hook never fires.
- **Queries live in services, never controllers.** This is the testability
  argument, not a style rule: a controller holding a query cannot be unit-tested
  without a database.
- **`prisma.$transaction`** for the `POST /products` + `variants[]` atomic
  create (§4).
- **`useFactory` + `inject`** for anything constructed once from config (the
  Stripe client, an S3 client) — the course's answer to
  `new Stripe(process.env.KEY)` inside a method.
- **Stay on `DEFAULT` scope.** `REQUEST` scope cascades to everything that
  depends on it. Relevant trap here: making `CaslAbilityFactory` request-scoped
  to "conveniently" read the user would drag a large part of the app with it.
  Pass the user in as an argument instead.
- **A circular dependency is a boundary problem**, not a `forwardRef()` problem.
  If `AuthModule` and `UsersModule` start needing each other, extract the shared
  piece.

### Config, validation, serialization, errors

`fundamentos-de-nestjs/04-ciclo-de-vida-config-y-validacion/` and
`05-guards-interceptors-y-filtros/03-exception-filters.mdx`.

- **`ConfigModule.forRoot({ isGlobal: true, validationSchema })`** covers the
  challenge's env-validation requirement, and fails at boot rather than in
  production. The course uses Joi; Zod or a `class-validator` class is equally
  acceptable — pick one and keep every value from §3 in it. Never
  `process.env.X` at a call site.
- **`ValidationPipe({ whitelist: true, transform: true })`** globally.
  `whitelist` is a security control here, not tidiness: it is what stops a
  sign-up body carrying `role: "manager"` (OWASP API3). `transform` is what makes
  `?limit=20` arrive as a number.
- **`ClassSerializerInterceptor` + `@Exclude()`** on `passwordHash` and on the
  `users_auth` token. Register it globally — remembering per-controller is how
  a leak happens. Caveat from the course: it only filters *class instances*, so
  services must return DTO/entity instances, not object literals.
- **`@ApiProperty()` and `@Exclude()` are independent systems.** A field can be
  in the response and absent from the docs, or vice versa.
- **One global exception filter** producing exactly the `ErrorResponse` shape
  already declared in `openapi.yaml` (`{ statusCode, message, error }`). Plus a
  Prisma-specific filter: `P2002` (unique violation) → `409`, matching the
  spec's `Conflict` response; without it a duplicate email surfaces as a `500`
  with query internals in the message.
- Throw the built-in subclasses (`NotFoundException`, `ConflictException`,
  `ForbiddenException`) rather than assembling status codes by hand.

### CORS, helmet, rate limiting

`seguridad-en-nestjs/05-protecciones-http/`.

- **`app.use(helmet())` first**, before anything else in `main.ts` — a
  middleware only protects what passes through it afterwards. Expect to loosen
  CSP for the Swagger UI.
- **`enableCors({ origin: [...], credentials: true })`** with an explicit list.
  `origin: '*'` together with `credentials: true` is rejected by browsers
  outright. If a paginated response ever exposes a custom header, it must be
  listed in the exposed-headers option — the REST course's CORS challenge is
  exactly this case.
- **`ThrottlerModule` + `ThrottlerGuard` as `APP_GUARD`** for a sane global
  limit, and **`@Throttle()` much stricter on `/auth/forgot-password` and
  `/auth/reset-password`** — the challenge asks for this by name, and the course
  spells out why a single global limit is useless against brute force. Sign-in
  deserves the same treatment.

## 11. Background work: which mechanism, and why

`nestjs-documentacion-y-tareas-en-segundo-plano/02-task-scheduling/`,
`03-colas-con-bullmq/`, `04-eventos/`, `05-logging-y-http-module/`.

The three mechanisms are not interchangeable, and the course draws the line
clearly:

| Mechanism | Survives a restart? | Retries? | Use in this project |
|---|---|---|---|
| `@nestjs/schedule` (`@Cron`) | No (in-process) | No | Cart expiry sweep, reset-token cleanup |
| BullMQ (Redis) | Yes | Yes (`attempts` + `backoff`) | Stock-notification emails, password-change email |
| `@nestjs/event-emitter` | No (in-memory) | No | Decoupling in-process reactions only |

Notes that matter for §2:

- **Cron**: `ScheduleModule.forRoot()`; 6-field patterns (seconds first) or the
  `CronExpression` enum; give every job a `name` if it must be controllable via
  `SchedulerRegistry`. Exceptions are caught and logged automatically — which
  means a critical job can fail silently, so log or alert deliberately.
- **BullMQ**: `BullModule.forRoot({ connection })` once, `registerQueue` per
  feature module, `@InjectQueue` to produce, `@Processor` + `WorkerHost.process`
  to consume, registered as a normal provider. `attempts` + exponential
  `backoff` on every job that calls an external service (email, S3). Never
  swallow an exception inside `process` — a silent `catch` marks the job
  `completed` and kills the retry. Use `@OnWorkerEvent('failed')` for the
  give-up path. **Redis is required**, which is a real deployment cost to state
  in the architecture write-up the challenge asks for.
- **Events are not a queue.** Tempting for "stock dropped to 3", but that
  notification must not evaporate on a restart — so it goes on the queue. An
  event is still the right tool if several in-process listeners need to react to
  one thing and the emitter should not grow a dependency per listener.
- **`Logger`**: `private readonly logger = new Logger(Thing.name)` as a class
  property (no DI needed). This is the only visibility into a cron job or a
  queue processor, where there is no request/response to inspect. Log the
  `stack` as the second argument to `logger.error`.
- **`HttpModule`** if an outbound HTTP call is needed: `HttpService` returns
  RxJS Observables — `firstValueFrom` or nothing happens at all. Always set a
  `timeout`; a hung external call inside a queue processor wedges the job.

## 12. Testing

`testing-unitario-y-tdd/` — the whole course, and it is the one the challenge
grades continuously ("write unit tests alongside development, focusing on
services").

- **Unit tests on services** is exactly where the course's pyramid puts the bulk
  of the effort. `PrismaService` gets replaced by a double; no database.
- **`Test.createTestingModule({...}).compile()`**, then `.get(Token)`.
  `overrideProvider(Token).useValue(mock)` when the real provider's constructor
  should never run at all — the difference from spying on a real instance is
  that the real constructor (and its DB connection) never executes.
- **Specific assertions.** `toEqual` for objects, `toBe` for primitives,
  `toHaveLength`, `rejects.toThrow('...')`. `toBeTruthy()` as a catch-all is the
  anti-pattern the course spends a whole topic on: it passes for almost
  anything, and tells you nothing when it fails.
- **Test behaviour, not call order.** An assertion that a private method was
  called in a particular sequence breaks on every refactor.
- **Clear mocks between tests** — leaked mock state is the usual cause of a test
  that fails only when run with others.
- **TDD** is available where it fits best: pure domain rules with a clear
  red/green step (cart-expiry check, stock/sellability rules, order-status
  transitions, order-history filter building). Red → minimal green → refactor,
  one requirement per cycle. The course is explicit that TDD is not a coverage
  target and does not replace up-front design.
- **BDD naming without Cucumber**: nested `describe` carrying the *Given* in
  domain language, `it` carrying the *Then* —
  `describe('when the variant has no stock') > it('rejects the cart item')`.
  Skip the ceremony on trivial pure functions.

### Jest → Vitest translation

The course is written in Jest; this repo runs Vitest (`vitest.config.ts`,
`*.spec.ts`, see `CLAUDE.md`). Everything from `@nestjs/testing` is unchanged.
Only the doubles differ:

| Course (Jest) | Here (Vitest) |
|---|---|
| `jest.fn()` | `vi.fn()` |
| `jest.spyOn(obj, 'm')` | `vi.spyOn(obj, 'm')` |
| `mockReturnValue` / `mockResolvedValue` / `mockImplementation` | identical |
| `mockReturnValueOnce` / `mockImplementationOnce` | identical |
| `jest.clearAllMocks()` in `afterEach` | `vi.clearAllMocks()` (or `clearMocks: true` in config) |
| `expect`, matchers, `.resolves` / `.rejects` | identical |

`@golevelup/ts-jest`'s `createMock<T>()` (course module 3) is Jest-bound. For a
wide interface like `ExecutionContext` in a guard test, either use the Vitest
equivalent package if one is added, or hand-write the small typed double — a
guard test usually needs only `switchToHttp().getRequest()`. `useMocker` on the
testing module is framework-agnostic and still available; the course's caveat
applies — if auto-mocking is saving real effort, the provider probably has too
many dependencies.

## 13. REST contract discipline, Swagger, and deliberate divergences

### What the REST course settles

`diseno-de-apis-rest/` — most of it is already baked into `openapi.yaml`, which
is why it reads the way it does. Worth re-reading when *changing* the contract:

- **`02-diseno-de-recursos/01-nombrar-recursos.mdx`** — plural nouns, no verbs,
  nesting only for real ownership, max 2–3 levels, query params for
  filter/sort/paginate. This is the rationale behind `/variants/{skuId}` living
  at the top level rather than under its product, and behind the `/me` rule in
  `info.description`.
- **`03-metodos-http-y-estados/`** — the verb table and the status-code table.
  `201` + `Location` on creates, `204` on deletes, `409` on duplicate email,
  `403` vs `401` (authenticated-but-forbidden vs unauthenticated). Also the
  justification for `POST /products/{id}/disable` as an action endpoint rather
  than a general-purpose `PATCH`.
- **`02-idempotencia.mdx`** — why `enable`/`disable` are not a `toggle` (§4), and
  **idempotency keys** for `POST /checkout/*`: a retried checkout must not
  charge twice. Not in scope this week; do not lose it.
- **`04-openapi-como-contrato/02-cambios-seguros-y-cambios-que-rompen.mdx`** —
  the table to check before editing the spec. Renaming a field, tightening a
  type, changing a status code, and moving the token all read as improvements
  and all break consumers. Adding an optional field is the only free change.
- **`02-diseno-de-recursos/03-problema-n-mas-1.mdx`** — a response-shape
  decision, taken now, not a Week-4 optimisation. Concretely: if
  `GET /products` returns products without their cover image or price range, the
  storefront will fire one request per row. Prisma's `include`/`select` is the
  implementation; what the endpoint promises is the design.

### Swagger from code vs. the hand-written spec

`nestjs-documentacion-y-tareas-en-segundo-plano/01-openapi-y-swagger-en-nestjs/`.

The docs course generates the OpenAPI document *from* the code; the REST course
treats a published document as a contract written *before* the code. This
project already did the second, so both apply in a specific order:

**`openapi.yaml` remains the source of truth. `@nestjs/swagger` output is a
drift detector against it, not a replacement.** A difference between the two is
a bug in the implementation until proven otherwise.

Practical steps:

- `SwaggerModule` + `DocumentBuilder` in `main.ts`; mirror `info.description`,
  the tags, and `.addBearerAuth()` from `openapi.yaml`.
- **Enable the CLI plugin** — `nest-cli.json` currently has no
  `compilerOptions.plugins`, so add `"plugins": ["@nestjs/swagger"]`. Without
  it, every DTO field needs a hand-written `@ApiProperty()`, and a forgotten one
  fails silently (the field just vanishes from the docs). With it, types and
  JSDoc `@example` comments are inferred at build time. Note the course's
  caveat: the inference only happens through `nest build` / `nest start`.
- `@ApiTags` per controller, `@ApiResponse` for the failure cases the spec
  already declares. A reusable `applyDecorators`-based decorator is the course's
  answer to repeating the same error responses on every endpoint.
- **Do not leave the Swagger UI open in production.** Basic auth behind a
  `NODE_ENV` check; `persistAuthorization: true` so a token pasted once survives
  across endpoints in the UI.

### Where we knowingly diverge

The course material is a *should*, not a *must*. These are the current
exceptions, with reasons:

| Course says | Here | Why |
|---|---|---|
| URI versioning (`/v1/...`) as the default | No version prefix | The same course calls versioning a last resort; one consumer, nothing published as v1. Revisit when that changes. |
| Generate OpenAPI from code | `openapi.yaml` is authored and authoritative | It was the Week-2 deliverable and is already a published contract |
| Jest | Vitest | Repo was scaffolded on Vitest; translation table in §12 |
| Joi for env validation | Joi *or* Zod *or* `class-validator` | The requirement is fail-at-boot validation, not a specific library |
| `PrismaClient` from `@prisma/client` | `src/generated/prisma` | Custom Prisma output path (`CLAUDE.md`) |
| Sessions as the alternative to JWT | Stateless JWT, no revocation | Settled in §4, with the cost accepted explicitly |

### OWASP mapping (`seguridad-en-nestjs/06-owasp-y-seguridad-de-apis/`)

Useful as a review checklist near the end of a feature, because it maps onto
work already planned rather than new libraries:

- **API1 / A01 — Broken Object Level Authorization.** The #1 real-world API
  vulnerability, and in this repo it is every `{orderId}`, `{skuId}` and
  `{imageId}` path. This is what CASL is for (§9).
- **API3 — property-level authorization.** `whitelist: true` plus DTOs that
  simply do not declare `role`, `status`, or `userId` as writable fields.
- **API5 / A01 — function-level authorization.** Manager-only endpoints need the
  role checked server-side on every request; a frontend that hides the button is
  not a control.
- **A02 — cryptographic failures.** bcrypt with salt; no secrets in the JWT
  payload (§8).
- **API4 — resource consumption.** Throttler, plus the `limit`/`offset` caps
  already in `openapi.yaml` (`maximum: 100`).
- **A05 / API8 — misconfiguration.** Helmet, an explicit CORS origin list, a
  global exception filter that never leaks stack traces or SQL, and a Swagger UI
  that is not public (§10, §13).
