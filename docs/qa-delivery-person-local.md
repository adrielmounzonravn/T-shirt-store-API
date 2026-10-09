# Delivery-person role — local manual QA pass

Post-checkpoint QA pass of the delivery-person role and `delivered` order
status, run entirely against a locally-running instance
(`npm run start:dev` against the already-running dev `postgres`/`redis`
containers), on 2026-09-11. Real Stripe test-mode PaymentIntents were used
for checkout (confirmed with `tok_visa` via the Stripe API, webhook events
fetched from the Stripe Events API and replayed to `POST /webhooks/stripe`
with a correctly HMAC-signed `Stripe-Signature` header, since no
`stripe listen` tunnel reliably forwarded live events in this run) — no
mocks, no direct Prisma writes to fabricate order status. This is a
point-in-time record, not a regression suite.

## What was verified

**Signup whitelist** — `POST /auth/signup` with a smuggled `role` field
(`deliveryPerson` or `manager`) returns `400 property role should not exist`
(global `forbidNonWhitelisted`), and no user is created (confirmed by a
follow-up sign-in attempt returning `401 Invalid credentials`, not a
password mismatch that would imply an existing row).

**`POST /users` (Manager-only delivery-person creation)** — anonymous caller
gets `401`; a Client token gets `403 Forbidden resource`; a Manager
requesting `role: manager` gets `400 role must be one of the following
values: deliveryPerson` (DTO whitelist correctly rejects any role but
`deliveryPerson`); a Manager creating `role: deliveryPerson` gets `201` with
the expected `UserEntity` shape.

**Order assignment (`PATCH /orders/{orderId}/delivery-person`)** — Client
and the delivery person themselves both get `403` trying to assign; a
Manager assigning to a non-`deliveryPerson` user id (a Client) gets `422
User is not an active delivery person`; assigning to a real, active
delivery person returns `200` with `deliveryPersonId` populated on the
order; re-assigning to the same person is idempotent (`200`, no error);
assigning is rejected with `422 Order must be paid or processing to assign
a delivery person` once the order is `delivered` or `cancelled`.

**Status flow, `paid → processing → shipped → delivered`** —
`processing → shipped` without an assignee correctly 422s
(`Order must have an assigned delivery person before it can be shipped`);
once assigned, Manager can advance `processing → shipped`; Manager
attempting to set `delivered` gets `403 Only the assigned delivery person
can mark an order as delivered` (Manager keeps `update Order` generally but
is explicitly blocked from this specific transition); an unassigned
delivery person gets `403 You are not assigned to this order` on the same
order; the assigned delivery person marking `delivered` succeeds (`200`);
the assigned delivery person attempting any other target status (e.g.
`processing`) gets `403 Delivery person can only mark an order as
delivered` — this per-actor check fires before the general transition
check, so it's a `403` even when the transition would also be
structurally invalid.

**Invalid/skipped transitions** — `paid → shipped` directly: `422 State
transition not allowed`; `paid → delivered` directly (as Manager, no
assignee): `403` (actor-gate fires first, same reasoning as above — still
correctly rejected); advancing a `cancelled` order's status: `422 State
transition not allowed`.

**Delivery-person read scoping** — an unassigned delivery person gets `403
You do not have access to this order` on `GET /orders/{orderId}` and an
empty `GET /orders` list (`total: 0`); the assigned delivery person sees
exactly that one order in their list and can read its detail, which
includes the nested `deliveryPerson: {fullName, email}` object.

**Manager `deliveryPersonId` filter** — `GET /orders?deliveryPersonId=<id>`
as Manager correctly returns only that delivery person's orders; the same
query param as a Client is silently ignored (per spec) — the Client still
sees only their own order.

**Cancellation semantics** — a Client cancelling their own `paid` order (no
assignee yet) succeeds (`200`, `status: cancelled`); cancelling an
already-`cancelled` order gets `422 The order is already cancelled and
cannot be cancelled`; cancelling a `delivered` order gets `422 The order is
already delivered and cannot be cancelled` — confirms the fix noted in the
plan's Phase 4 (previously this reason string incorrectly said "already
shipped" for a delivered order).

**Auth hardening on the new endpoints** — anonymous `GET /orders` and
anonymous `PATCH /orders/{orderId}/delivery-person` both correctly return
`401`, distinct from the `403`s above.

**Real checkout end-to-end** — cart → `POST /checkout/payment-intent` →
Stripe PaymentIntent confirmed with `tok_visa` → real
`payment_intent.succeeded` event replayed to the webhook with a valid
signature → order flipped `pending → paid` — used as the realistic
precondition for the delivery-person flow above, exercising the same
webhook path already verified in `docs/production-verification.md`.

## Bug found and fixed

**Manager-created delivery-person accounts could never sign in.**
`POST /users` (`src/users/users.controller.ts` → `UsersService.create`,
`src/users/users.service.ts`) calls `PrismaService.user.create` directly
with no `isVerified` override, so the row is born with the schema default
`isVerified: false`. Unlike `POST /auth/signup`, which goes through
`AuthService.signUp` (issues an email-verification JWT and sends the
verification email via `MailService`), the Users controller only calls
`UsersService.create` — no verification token is ever minted for the new
account, and `AuthService.signIn` unconditionally rejects unverified users
(`403 Email is not verified yet`, `src/auth/auth.service.ts:81`). There is
no other path to flip `isVerified` (`UsersService.markVerified` is only
ever called from `AuthService.verifyEmail`, which needs a token that was
never issued).

Repro:
```
curl -X POST http://localhost:3000/users -H "Authorization: Bearer <manager token>" \
  -H "Content-Type: application/json" \
  -d '{"email":"qa-delivery-2@example.com","password":"Password123!","fullName":"QA Delivery Two","role":"deliveryPerson"}'
# 201, isVerified: false

curl -X POST http://localhost:3000/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"qa-delivery-2@example.com","password":"Password123!"}'
# 403 {"message":"Email is not verified yet"}
```

Confirmed by direct DB inspection: the row's `isVerified` stayed `false`
indefinitely with no code path to change it outside `AuthService`. Worked
around for the rest of this QA pass by flipping `isVerified` to `true`
directly in Postgres for the test account (`qa-delivery-2@example.com`) so
the "unassigned delivery person" scenarios above could be exercised — that
was a manual override to keep testing moving, not the fix.

Neither `docs/delivery-person-plan.md` nor `docs/openapi.yaml` documented an
intended "born verified" or "no verification needed" behavior for this
endpoint — the plan's "No new notifications" decision is scoped to
assignment/`delivered`, not account creation. This was an overlooked gap
rather than a deliberate decision: as implemented, every delivery person a
Manager created was unusable until someone manually edited the database.

**Fix applied:** `CreateUserInput` (`src/users/users.service.ts`) gained an
explicit `isVerified` field (defaulting to `false`, preserving the
self-signup path's behavior), and `UsersController.create`
(`src/users/users.controller.ts`) now passes `isVerified: true` when
calling `UsersService.create` — the Manager creating the account is
vouching for it, mirroring how the `Client123!`/`Delivery123!` seed users
are always pre-verified. Unit tests for both `UsersService.create` and
`UsersController.create` were updated by a separate subagent to cover the
new default/override behavior, per `CLAUDE.md`'s test-delegation rule.

## Cleanup

- Stopped the `npm run start:dev` process and the `stripe listen` process
  started for this pass; left the `postgres`/`redis` dev containers running
  (they were already up before this session).
- `.env`'s `STRIPE_WEBHOOK_SECRET` was temporarily changed from the
  checked-in placeholder `change-me` to a real `stripe listen`-issued
  secret to receive/replay webhook events, and was reverted back to
  `change-me` at the end of this pass (`.env` is gitignored, never
  committed).
- Leftover dev-database rows from this pass (fine to leave, same as any
  other dev-DB noise): two extra `deliveryPerson` users
  (`qa-delivery-new@example.com`, `qa-delivery-2@example.com`, the latter
  manually verified per the bug above), two extra orders on
  `client@tshirtstore.dev` (one `delivered`, one `cancelled`), and the two
  rejected/failed signup attempts left no rows (confirmed above).
