# Delivery Person role — implementation plan

**Goal:** pick up the **Delivery Person role** bullet from
`docs/challenge.md`'s "Scope — optional features excluded" (§149-156): a third
`Role` with orders assigned to it and a delivery history, plus the
`shipped → delivered` transition the delivery flow needs to end anywhere. When
every box is ticked, a Manager can assign a paid/processing order to a delivery
person, that person can see only their assigned orders and mark them
`delivered`, and `docs/db-schema.md` / `docs/openapi.yaml` describe all of it —
so the feature stops being "excluded scope" in `implementation-notes.md` §4.

**How to use this file**

- It is a checklist, not a spec. Technical decisions belong to whoever picks
  up the step (read `docs/` first — it is the source of truth).
- Mark `[x]` when a step is done, and only when tests + lint + typecheck pass.
- Steps inside a phase can be reordered; phases are roughly sequential.
- Add a note under **Notes** only if a later session would be wrong without it
  (a deviation from `docs/`, a blocker, a decision taken on the fly). Keep it
  to one or two lines. No summaries of work already visible in the code.
- Unit tests are part of each step, but are written by a **separate subagent**
  that never sees the implementation (`CLAUDE.md`). Same rule for the e2e
  suites in Phase 6.

---

## Decisions this plan assumes

Recorded here so no step re-litigates them mid-implementation. Two are still
open — see **Open decisions** below.

- **Assignment lives on `orders`, not in a join table.** One order has at most
  one delivery person, so a nullable `orders.delivery_person_id` FK to `users`
  is enough. This is the first `users` FK on `orders` — the owner is still
  reached through `cartNumber -> CartNumber.userId` (`prisma/schema.prisma`
  L195-197), and that stays unchanged.
- **Assignment is its own Manager-only endpoint**, not a side effect of
  advancing the status: assigning is reversible/re-assignable and must be
  possible before the order ships.
- **`processing → shipped` requires an assigned delivery person.** Shipping an
  order nobody carries is the state this feature exists to prevent.
- **`shipped → delivered` is performed by the assigned delivery person.** The
  Manager keeps `read`/`update` on every order but does not advance to
  `delivered` — see Open decisions if that is wrong.
- **Delivery history reuses `GET /orders`** rather than adding
  `GET /me/deliveries`: `OrdersService.findMany` already owns the filters,
  pagination and price aggregation the challenge asks for, and it already
  scopes by role. A delivery person's scope becomes
  `delivery_person_id = user.sub`. The `/me` prefix rule
  (`implementation-notes.md` §4) is respected — no `/me` route is added.
- **No new notifications.** No email or queued job on assignment or on
  `delivered`. Nothing in the challenge asks for one, and `MailService` /
  BullMQ stay untouched by this feature.

### Open decisions (block the steps that name them)

1. **Who may set `delivered`** — the assigned delivery person only (this
   plan's assumption), or the Manager as well? Affects Phase 4.
2. **Per-order status history** — the excluded-scope list couples the
   `delivered` status with "full per-order status history"
   (`docs/challenge.md` L156). This plan treats the history table as separate
   and optional: Phase 8 stays unticked unless you decide to take it. Sizing
   note: the AI-module change is meant to fit two days
   (`docs/ai-module/assignment.md`).

## Code seams this feature touches

Listed so no later session has to re-discover them.

- `prisma/schema.prisma` — `enum Role` L19-22, `enum OrderStatus` L59-65,
  `model User` L73-89, `model Order` L198-213
- `prisma/migrations/` — new migration, hand-edited per
  `implementation-notes.md` §1; `prisma/seed.ts` L337-357 (manager/client
  upserts)
- `src/casl/casl-ability.factory.ts` — `Subjects` L5-13, `Action` L14-15,
  `createForUser` L25-52 (the `else` branch is currently the *client* branch,
  so a new role would silently inherit client abilities)
- `src/auth/guards/roles.guard.ts` L16-26, `src/auth/decorators/roles.decorator.ts`,
  `src/auth/jwt-payload.interface.ts`, `src/auth/auth.service.ts` L85 (payload
  minting), `src/auth/guard-order.spec.ts` (guard-chain contract)
- `src/orders/orders.service.ts` — `ALLOWED_STATUS_ADVANCES` L20-25,
  `CANCELLABLE_STATUSES` L27-31, `OrderRow` L33-43, `findMany` L49-139,
  `findOne` L141-193, `advanceStatus` L195-237, `cancel` L239-287
- `src/orders/orders.controller.ts` L34-123,
  `src/orders/dto/advance-order-status.dto.ts`,
  `src/orders/dto/list-orders-query.dto.ts`,
  `src/orders/entities/order-detail.entity.ts`, `.../order-list.entity.ts`,
  `src/checkout/entities/order.entity.ts` L22-56
- `src/users/users.service.ts` (`CreateUserInput` L7-11, `create` L20-35 — role
  is not settable and there is **no users controller**),
  `src/users/entities/user.entity.ts`
- Specs: `src/casl/casl-ability.factory.spec.ts`,
  `src/orders/orders.service.spec.ts`, `src/users/users.service.spec.ts`,
  `test/orders.e2e-spec.ts`, `test/auth.e2e-spec.ts` (asserts signup role is
  `client`), `test/e2e/test-app.ts` (`seedUser` already takes a `role`)

---

## Phase 0 — Schema and migration

- [x] Add `deliveryPerson` to `enum Role` in `prisma/schema.prisma`
- [x] Add `delivered` to `enum OrderStatus` in `prisma/schema.prisma`
- [x] Add nullable `deliveryPersonId` to `model Order` with its relation to
      `User` (named relation — `User` already has `cartNumbers`), and the
      matching back-reference on `User`
- [x] Generate the migration with
      `npx prisma migrate dev --create-only --name add_delivery_person_role`
      and hand-edit it per `implementation-notes.md` §1: a partial FK index
      `CREATE INDEX orders_delivery_person_id_idx ON orders(delivery_person_id)
      WHERE delivery_person_id IS NOT NULL` (assignment is sparse), and a CHECK
      constraint that `shipped`/`delivered` orders always carry an assignee
- [x] `npx prisma generate`, then confirm `npm run build` and `npm test` are
      still green against the regenerated client
- [x] Seed a `deliveryPerson` user in `prisma/seed.ts`, mirroring the existing
      manager/client upserts

**Notes:** the `chk_shipped_delivered_has_assignee` CHECK constraint
(added in this phase) is not yet satisfiable by app logic until Phase 4
gates `processing → shipped` on having an assignee. Until Phase 4 lands,
`npm run test:e2e` fails on 3 pre-existing `orders.e2e-spec.ts` cases that
create a `shipped` order without a `deliveryPersonId` (manager advances
processing→shipped; 422 on already-shipped for out-of-flow and for cancel).
This is expected sequencing, not a regression to fix in Phase 0-3 — Phase 4
must update those fixtures/expectations, or Phase 6 will need to.

## Phase 1 — Authorization (CASL + guards)

- [x] Restructure `createForUser` into explicit per-role branches so the
      fallback is no longer "client" — a role with no branch must get no
      abilities. Unit tests: `src/casl/casl-ability.factory.spec.ts` (add a
      `deliveryPerson` block and an assertion that an unknown role is empty)
- [x] Add the `assign` action to `Action` and grant it to the Manager for the
      `Order` subject; grant the delivery person `read Order` and `update
      Order` (nothing else — no `Product`, `Cart`, `LikedProduct`)
- [x] Confirm `RolesGuard`/`Roles()` need no change for a third role, and that
      `src/auth/guard-order.spec.ts`'s chain contract still holds for the new
      endpoint added in Phase 3

**Notes:**

- `deliveryPerson`'s branch in `createForUser` now grants `read`/`update`
  `Order` only; no `assign` and no other subject.
- `RolesGuard` is already role-count-agnostic (`requiredRoles.includes(request.user.role)`
  over the variadic `@Roles(...)` array), and `guard-order.spec.ts`'s chain
  assertions (401 → 403 → 200, RolesGuard-vs-PoliciesGuard separation) don't
  depend on role count either. No code change needed for a third role.
- **Known exposure window until Phase 4**: `PATCH /orders/{orderId}/status`
  (`orders.controller.ts`) is gated only by `ability.can('update', 'Order')`,
  with no `RolesGuard`/role check of its own. Since `deliveryPerson` now
  holds `update Order`, a delivery person can currently call that endpoint
  and advance any order's status (e.g. `paid → processing → shipped`) with
  no per-actor restriction in `advanceStatus`. This closes only once Phase 4
  adds the per-actor rule restricting `deliveryPerson` to `shipped →
  delivered` on their own assigned order. Do not merge/deploy this branch
  before Phase 4 lands.

## Phase 2 — Creating delivery-person accounts

- [x] Let `UsersService.create` accept an explicit `role` (defaulting to
      `client` so `AuthService.signUp` is unaffected). Unit tests:
      `src/users/users.service.spec.ts` — keep the existing "does not forward a
      caller-supplied role" guarantee for the sign-up path while the new,
      explicit path does
- [x] Add a Manager-only `POST /users` (`JwtAuthGuard, RolesGuard,
      PoliciesGuard`) with a DTO that accepts `email`, `password`, `fullName`
      and a `role` restricted to `deliveryPerson`, returning `UserEntity`. This
      is the first users controller — follow the controller/Swagger conventions
      in `implementation-notes.md` §10 and §13
- [x] Confirm `POST /auth/signup` still cannot set a role (`forbidNonWhitelisted`
      already 400s an extra field; `test/auth.e2e-spec.ts` asserts the created
      role is `client`)

**Notes:** confirmed `SignUpDto` has no `role` field and the global
`ValidationPipe` (`src/main.ts`) keeps `forbidNonWhitelisted: true`. Added an
e2e case asserting a smuggled `role` field 400s and creates no user
(`test/auth.e2e-spec.ts`), since the prior extra-field test only used a
generic field name.

## Phase 3 — Assigning an order to a delivery person

- [x] `OrdersService.assignDeliveryPerson`: validates the target user exists,
      is active and has role `deliveryPerson`; rejects assignment unless the
      order is `paid` or `processing`; is idempotent for a re-assignment to the
      same person. Unit tests: `src/orders/orders.service.spec.ts`
- [x] `PATCH /orders/{orderId}/delivery-person` in `src/orders/orders.controller.ts`,
      gated on `ability.can('assign', 'Order')`, with its DTO
      (`deliveryPersonId`, UUID)
- [x] Expose `deliveryPersonId` (and the delivery person's name/email on the
      detail read) on the order entities — `order-detail.entity.ts`,
      `order-list.entity.ts`, and the `OrderRow`/raw-SQL projection in
      `orders.service.ts`

**Notes:**

- `deliveryPersonId` lives on the shared `OrderEntity`
  (`src/checkout/entities/order.entity.ts`), so `order-list.entity.ts` needed
  no change — it already wraps `OrderEntity[]` and inherits the field.
  `order-detail.entity.ts` adds the name/email separately, nested under a
  `deliveryPerson: OrderDeliveryPersonEntity | null` field (null when
  unassigned), mirroring the existing `OrderItemVariantEntity` nesting
  pattern rather than flattening two more scalar fields onto the entity.

## Phase 4 — `shipped → delivered`

- [x] Extend `ADVANCEABLE_STATUSES` in `src/orders/dto/advance-order-status.dto.ts`
      with `delivered`
- [x] Extend `ALLOWED_STATUS_ADVANCES` with `shipped → delivered`, and gate
      `processing → shipped` on the order having an assignee (422, consistent
      with the existing out-of-flow error). Unit tests:
      `src/orders/orders.service.spec.ts`
- [x] Add the per-actor rule to `advanceStatus`: only the assigned delivery
      person may set `delivered`, and a delivery person may set nothing else
      (403). **Blocked on Open decision 1.** Unit tests:
      `src/orders/orders.service.spec.ts`
- [x] Confirm `CANCELLABLE_STATUSES` still excludes `shipped` and `delivered`,
      and that `cancel`'s "already shipped" reason string still reads correctly
      for a delivered order

**Notes:** Open decision 1 resolved: only the assigned delivery person may
set `delivered` (the plan's original assumption); the Manager gets 403 on
that transition even though it still holds `update Order` generally.

`CANCELLABLE_STATUSES` already excluded `shipped`/`delivered`, but `cancel`'s
reason string fell back to "already shipped" for a `delivered` order, which
was factually wrong. Added an explicit `already delivered` branch.

## Phase 5 — Delivery history (read paths)

- [ ] Scope `OrdersService.findMany` for a delivery person to
      `delivery_person_id = user.sub` (currently `isManager ? query.userId :
      user.sub` on `cn.user_id`, L55-56) so every existing filter, price range
      and pagination option keeps working. Unit tests:
      `src/orders/orders.service.spec.ts`
- [ ] Add a Manager-only `deliveryPersonId` filter to
      `src/orders/dto/list-orders-query.dto.ts`, mirroring how the existing
      manager-only `userId` filter is handled
- [ ] Extend the ownership check in `findOne` (L158) so a delivery person can
      read an order assigned to them and 403s on any other. Unit tests:
      `src/orders/orders.service.spec.ts`

**Notes:**

## Phase 6 — E2E coverage

- [ ] Written by a subagent that did not implement Phases 0-5, against the
      real Postgres Testcontainer (`test/e2e/global-setup.ts` runs
      `prisma migrate deploy`, so Phase 0's migration is picked up
      automatically; `seedUser` already accepts a `role`)
- [ ] New `test/deliveries.e2e-spec.ts`: Manager creates a delivery person,
      assigns a paid order, the delivery person lists only their assigned
      orders and reads one, marks it `delivered`, and is refused on an order
      that is not theirs
- [ ] Extend `test/orders.e2e-spec.ts`'s status block (L445-595) with
      `processing → shipped` refused without an assignee and
      `shipped → delivered` accepted, keeping the existing cases green

**Notes:**

## Phase 7 — Docs sync

- [ ] `docs/db-schema.md`: add `deliveryPerson` / `delivered` to the DBML
      enums, `orders.delivery_person_id` plus its `Ref`, and — in "Rules the
      schema cannot express on its own" — that only a `deliveryPerson` may be
      assigned, that a delivery person's reads are scoped to their assignments,
      and who may advance to `delivered`
- [ ] `docs/openapi.yaml`: the new enum values, `PATCH
      /orders/{orderId}/delivery-person`, the manager-only `deliveryPersonId`
      query filter, `POST /users`, and `deliveryPersonId` on the order
      schemas. Keep it the contract, with generated Swagger as the check on it
      (`implementation-notes.md` §4)
- [ ] `docs/implementation-notes.md` §4: amend the "Optional features are out
      of scope" bullet — the delivery-person role and `delivered` are now
      implemented; promo codes and full status history remain out (unless
      Phase 8 is taken). Record the decisions listed at the top of this file
- [ ] `docs/challenge.md`: note next to L129 and the Scope list that the
      delivery-person bullet has been picked up post-checkpoint; and update
      `CLAUDE.md`'s "Nothing from `docs/challenge.md`'s Scope — optional
      features excluded is in scope" line accordingly
- [ ] `docs/ai-module/writeup.md`: fill in the **Improvement**, before/after
      and evidence rows for this change, since this is the AI-module
      improvement on branch `ai-module/delivery-person-role`

**Notes:**

## Phase 8 — Per-order status history (optional, gated on Open decision 2)

Take only if you decide the `delivered` bullet's "full per-order status
history" is in scope. Leave every box unticked otherwise, and say so in Notes.

- [ ] New `order_status_history` table (order FK, from/to status, actor user
      FK, `changed_at`) in `prisma/schema.prisma` plus a hand-edited migration
      per `implementation-notes.md` §1
- [ ] Write a history row inside the same transaction as every status change
      in `orders.service.ts` (`advanceStatus`, `cancel`, and the webhook's
      `pending → paid`). Unit tests: `src/orders/orders.service.spec.ts`,
      `src/webhooks/*.spec.ts`
- [ ] Expose the history on the order detail read, and sync `docs/db-schema.md`
      + `docs/openapi.yaml`

**Notes:**
