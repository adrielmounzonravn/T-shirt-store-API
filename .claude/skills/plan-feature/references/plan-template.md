# Plan file template

Copy this structure into `docs/<feature-slug>-plan.md`. Replace every
`<...>` placeholder and delete this file's own commentary (the lines marked
`> template note:`) before writing the final doc — the finished plan should
read exactly like `docs/week-4-plan.md`, with no trace of this template.

---

```markdown
# <Feature name> — implementation plan

**Goal:** <one to three sentences: what this closes out, and which section
of docs/challenge.md's excluded-scope list it picks up>

**How to use this file**

- It is a checklist, not a spec. Technical decisions belong to whoever picks
  up the step (read `docs/` first — it is the source of truth).
- Mark `[x]` when a step is done, and only when tests + lint + typecheck
  pass.
- Steps inside a phase can be reordered; phases are roughly sequential.
- Add a note under **Notes** only if a later session would be wrong without
  it (a deviation from `docs/`, a blocker, a decision taken on the fly).
  Keep it to one or two lines. No summaries of work already visible in the
  code.

---

## Phase 0 — Schema and migration

- [ ] <e.g. add `deliveryPerson` to the `Role` enum in
      `prisma/schema.prisma`>
- [ ] <e.g. add `delivered` to the `OrderStatus` enum, plus any new
      table/column named in db-schema.md for this feature>
- [ ] Generate the migration with
      `npx prisma migrate dev --create-only --name <name>` and hand-edit it
      per `implementation-notes.md` §1 (partial indexes, CHECK constraints)
- [ ] `npx prisma generate`

**Notes:**

## Phase 1 — <application logic, e.g. CASL + guards>

- [ ] <one step per concern — see SKILL.md's sizing guidance>

**Notes:**

## Phase 2 — <application logic, e.g. order-status transition>

- [ ] ...

**Notes:**

## Phase 3 — Docs sync

- [ ] Update `docs/db-schema.md` with the new table/enum and any rule the
      schema can't express
- [ ] Update `docs/openapi.yaml` with the new/changed endpoints
- [ ] Update `docs/implementation-notes.md`'s settled-decisions log if this
      feature required a new decision

**Notes:**
```

> template note: add or remove phases freely — the four above are a
> starting shape, not a fixed count. A small feature may collapse Phase 1
> and 2 into one; a larger one may need a Phase 4 for background jobs.
