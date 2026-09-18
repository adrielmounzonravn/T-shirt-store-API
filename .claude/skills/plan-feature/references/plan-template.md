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

## Decisions this plan assumes

> template note: record every non-obvious choice the plan makes without
> escalating it to the user — the "why this and not that" a later session
> would otherwise have to re-derive or, worse, silently redo differently.
> One bullet per decision, bold the decision itself, then justify it in a
> sentence or two with a pointer to the code/doc that makes it true. If any
> assumption here is actually unresolved rather than settled, it belongs in
> **Open decisions** below instead, not here.

- <e.g. **Assignment lives on `orders`, not in a join table.** One order has
  at most one delivery person, so a nullable FK is enough — see
  `prisma/schema.prisma` L<n>>
- <...>

### Open decisions (block the steps that name them)

> template note: unresolved choices the plan deliberately leaves for the
> implementer/user to settle — not things you forgot to decide, but things
> only they can decide (a product/policy call, a tradeoff with no clearly
> better default). Number them, state the options, and name which phase/step
> is blocked on each so `/implement-step` knows to stop and ask rather than
> guess. Delete this subsection only if the feature genuinely has none —
> that should be rare enough to double-check.

1. <e.g. **Who may set `delivered`** — the assigned delivery person only, or
   the Manager as well? Affects Phase <n>.>
2. <...>

## Code seams this feature touches

> template note: the concrete files/symbols this feature will touch or add,
> found via Explore/grep during context-gathering — listed so a later
> session doesn't have to re-discover them. Group by area (schema, CASL/auth,
> the service(s), controller/DTOs/entities, specs) and cite line ranges where
> they help (they will drift as code changes, but even an approximate pointer
> saves a search). This is a map, not a spec — it says where, not what to
> write there.

- `prisma/schema.prisma` — <enums/models this feature adds fields or values
  to, with line ranges>
- `src/casl/casl-ability.factory.ts` — <the ability branches affected>
- `<service>.ts` — <the specific exported methods/constants this feature
  changes or adds>
- `<controller>.ts`, `<dto>.ts`, `<entity>.ts` — <endpoints/fields affected>
- Specs: <every `*.spec.ts` / `*.e2e-spec.ts` file that will need new or
  updated cases>

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
