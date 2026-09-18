---
name: implement-step
description: This skill should be used when the user asks to "implement the next step", "do step <N>", "work on the next unchecked item", or names a specific checkbox from a plan file such as one produced by /plan-feature (e.g. docs/delivery-person-plan.md). Implements exactly one plan step end to end — code, delegated tests, checks, and ticking the box — without scope creep into other steps.
---

# Implement One Plan Step

Take a single `- [ ]` item from a plan file (produced by `/plan-feature` or
written by hand in the same format as `docs/week-4-plan.md`) and implement
only that item, following this repo's `CLAUDE.md` rules — most importantly,
that unit and e2e tests are written by a **separate subagent that never
sees the implementation**, not by whoever wrote the code.

## When to use this skill

Invoke as `/implement-step <plan-file> [step reference]`, for example:

```
/implement-step docs/delivery-person-plan.md "add deliveryPerson to the Role enum"
/implement-step docs/delivery-person-plan.md next
```

If no step reference is given, or `next` is passed, pick the first
unchecked `- [ ]` box under the first phase that has one.

## Workflow

### 1. Identify the step

Read the plan file. Locate the exact `- [ ]` line requested (or the first
unchecked one). Read that phase's other steps for context, but implement
**only** the one identified step — do not fold in neighboring steps even if
they look related; that is what makes the plan's granularity useful for
review and for small commits.

### 2. Read the governing docs for this concern

Before writing code, check `docs/implementation-notes.md` Part B for which
course/pattern governs this kind of change (CASL, guards, cron vs. queue,
REST/Swagger discipline) and its **"Settled decisions — do not re-litigate"**
log for anything already decided about this area. Check `docs/db-schema.md`
for rules the schema itself can't enforce (soft-delete filtering,
sellability, etc.) if the step touches queries. Do not re-derive a decision
that is already settled there — implement it as written, or flag the
conflict to the user instead of silently picking a different approach.

### 3. Implement the step

Write the minimum code that satisfies this one checkbox. Follow existing
patterns in the touched files rather than introducing new ones (e.g. a new
role's CASL rules belong in the same `createForUser` branch style already
used in `src/casl/casl-ability.factory.ts`; a new order-status transition
belongs in the same `ALLOWED_STATUS_ADVANCES`-style map already used in
`src/orders/orders.service.ts` — but verify the exact current shape by
reading the file, since it may have changed since this skill was written).
Remember the ESM import rule from `CLAUDE.md`: relative imports need the
`.js` extension.

### 4. Delegate test-writing to a fresh subagent

This is not optional — it is `CLAUDE.md`'s standing rule, and this skill's
job is to make sure it actually happens for every step, not just when
remembered.

Use the Agent tool to spawn a subagent for the `*.spec.ts` (and, if the step
touches a critical path — auth, checkout, order history — the
`*.e2e-spec.ts`) tests. Give that subagent **only**:

- The file path(s) of the public interface it must test.
- The exported method signatures / DTOs / types.
- The expected behavior, taken from `docs/` (the relevant section of
  `db-schema.md`, `openapi.yaml`, or the plan step's own wording) — not from
  the implementation just written.

Do **not** give the subagent the implementation source, a diff, or any
description of how the code was built. The point is tests that would catch
a bug the implementer didn't think to check — handing over the
implementation defeats that. See `references/test-delegation-prompt.md` for
a ready-to-adapt prompt template.

### 5. Run local checks

Run `npm run lint`, `npx tsc --noEmit` (or `npm run build`), and
`npx vitest run <the new/changed spec files>` before considering the step
done. If the step touches a critical e2e path, also run
`npm run test:e2e` (requires Docker for the Testcontainers Postgres). Fix
failures — in either the implementation or, after review, in a test that
was wrong — before moving on. Do not weaken a test to make it pass.

**Hard constraint: local or Testcontainer database only.** Any migration
(`npx prisma migrate dev`, `migrate deploy`, etc.) or e2e test run as part
of this step must target a local Postgres or the Testcontainers instance
`test/e2e/global-setup.ts` spins up — never a shared, hosted, or production
database. Check `DATABASE_URL` before running either. This is non-negotiable
regardless of what a step seems to call for: a migration applied to a
hosted deployment before the app logic satisfying its constraints exists is
exactly how a past incident happened (see GitHub issue #2).

For a broader pass across the whole diff (standards compliance, spec
compliance, bottleneck/future-risk scan), hand off to `/review-and-verify`
rather than duplicating that work here — this skill's own checks are a
narrow, step-scoped gate, not the full review.

### 6. Tick the box and stop

Edit the plan file: change this step's `- [ ]` to `- [x]`, only now that
tests + lint + typecheck (+ e2e, if applicable) pass — same rule the plan
file's own "How to use this file" section states. Add a line under that
phase's `**Notes:**` only if a later session would be wrong without it (a
deviation from `docs/`, a blocker hit, a decision made on the fly). Do not
summarize work that's already visible in the code or tests.

**Known-red exception.** A box can still be ticked with a check red if the
failure is an expected, documented consequence of sequencing — not a real
bug — and the step's `**Notes:**` name which later step will close it. This
is what `docs/delivery-person-plan.md` Phase 0 actually did: its CHECK
constraint made 3 `orders.e2e-spec.ts` cases fail until Phase 4 gated
`processing → shipped` on having an assignee, and the boxes were ticked with
a Notes line saying so and naming Phase 4 as the fix. Ticking silently,
without recording the failure and its resolving step, is never acceptable —
the exception is for recording a known, sequenced gap, not for waving one
through.

**Blocked-on-open-decision case.** If a step depends on one of the plan's
**Open decisions** (`/plan-feature`'s mechanism for a choice the plan
deliberately left unresolved) and that decision is still open, leave the box
unticked rather than force an implementation on top of an unmade choice.
Use judgment on whether partial, decision-independent work in the step is
worth landing under a caveat note instead of leaving the whole step
untouched — but the box itself only flips to `[x]` once the step's actual
behavior is settled, not before.

Stop after this one step. Do not automatically continue to the next
checkbox — each step should land as its own reviewable, small commit per
`CLAUDE.md`'s commit-granularity guidance, and the user decides when to
invoke this skill again.

## Additional Resources

- **`references/test-delegation-prompt.md`** — template prompt for the
  test-writing subagent in step 4, with a worked example for a CASL-ability
  test case.
