# Repo-specific risk areas

Check these whenever the corresponding files are in the diff. This list is
about *this* codebase's known shape, not a generic checklist — update it as
the codebase changes.

## CASL / authorization (`src/casl/casl-ability.factory.ts`)

- `CaslAbilityFactory.createForUser` branches on `user.role`. A new role
  added without its own branch silently falls through to whichever branch
  is checked last (currently the `client`/else branch) — this is a
  privilege leak, not a compile error, so it will not be caught by
  typecheck. Verify every `Role` enum value has an explicit branch.
- A rule granting `update` on `Order` must be scoped to the fields actually
  allowed to change (e.g. only `status`) and, where relevant, to orders the
  actor owns or is assigned to — check for a missing `conditions` object
  restricting to `{ userId: user.id }` or an equivalent assignment field.

## Order status transitions (`src/orders/orders.service.ts`)

- `ALLOWED_STATUS_ADVANCES` and `CANCELLABLE_STATUSES` are the two maps
  that encode the whole status-flow contract from `docs/challenge.md` §10.
  A new status value (e.g. `delivered`) needs entries in both if it should
  be cancellable or advance-able, and needs the matching entry in
  `src/orders/dto/advance-order-status.dto.ts`'s `ADVANCEABLE_STATUSES`.
  Missing any one of the three lets an invalid transition either succeed
  silently or fail with the wrong error.
- Check `advanceStatus()`'s role check: confirm the role permitted to call
  this transition matches what CASL grants — a mismatch between the guard
  and the CASL rule is a common source of either an over-permissive or
  falsely-rejected transition.

## Schema/migration gaps (`prisma/schema.prisma` + migrations)

- Per `docs/implementation-notes.md` §1, some constraints (partial indexes,
  CHECK constraints) cannot be expressed in the Prisma schema DSL and must
  be hand-added to the generated migration SQL. A migration generated with
  `--create-only` that was never hand-edited is a red flag — check the
  migration file's SQL against `db-schema.md`'s "rules the schema can't
  express" section, not just the Prisma schema.
- `db push` must never appear in a diff or a workflow change — migrations
  are applied with `migrate dev`/`migrate deploy` only (settled decision,
  see `implementation-notes.md` §1).

## New list/query endpoints (any new controller method returning a list)

- Check for N+1 queries: a new endpoint that loads a collection and then
  loads a relation per item in a loop, instead of a single query with
  `include`/`select`.
- Check soft-delete and sellability filtering are applied per
  `docs/db-schema.md`'s "rules the schema can't express" section — these
  are enforced in application code, so a new query that bypasses the
  existing repository/service method and queries Prisma directly is a
  likely place for this rule to get missed.

## Background jobs / cron (BullMQ, `@nestjs/schedule`)

- A new job must set `attempts`/`backoff` per the settled config in
  `implementation-notes.md` §11 (`QUEUE_JOB_ATTEMPTS`,
  `QUEUE_JOB_BACKOFF_DELAY_MS`) rather than using BullMQ defaults.
- A new cron job must be idempotent against re-runs (the cart-expiry and
  reset-token jobs already establish this pattern) — check a new job
  doesn't assume it runs exactly once.
