---
name: plan-feature
description: This skill should be used when the user asks to "plan a feature", "write an implementation plan", "break this down into steps", "create a plan doc", or wants a checklist for a feature before any code is written — especially one of the optional features listed in docs/challenge.md's Scope section (delivery-person role, delivered status, promo codes). Produces a docs/<feature-slug>-plan.md checklist in the same format as the closed docs/week-3-plan.md and docs/week-4-plan.md.
allowed-tools: Read Grep Glob Write(docs/*.md) Agent
disallowed-tools: Edit NotebookEdit Bash
---

# Plan a Feature

Turn a feature request into a phased, checkbox-driven implementation plan at
`docs/<feature-slug>-plan.md`, matching the format of the closed
`docs/week-3-plan.md` / `docs/week-4-plan.md` checkpoints. This skill only
plans — it never edits application code and never ticks a checkbox itself.
Each step it writes should be small enough for one `/implement-step`
invocation to finish end to end (code + delegated tests + green checks).

## When to use this skill

Invoke as `/plan-feature <feature description>`, for example:

```
/plan-feature Add the Delivery Person role from docs/challenge.md's excluded scope: assigned orders, delivery history, shipped -> delivered status.
```

## Workflow

### 1. Gather context before planning

Read, in this order (per `CLAUDE.md`'s own reading order):

1. `docs/challenge.md` — check the **Scope — optional features excluded**
   section; if the requested feature is listed there, treat it as genuinely
   new schema + new CASL abilities, not a small addition.
2. `docs/db-schema.md` — confirm which tables/enums do not yet exist for
   this feature, and read the "rules the schema can't express" section for
   constraints the plan must call out.
3. `docs/openapi.yaml` — confirm which endpoints are undocumented for this
   feature.
4. `docs/implementation-notes.md` — read the **"Settled decisions — do not
   re-litigate"** log in full before proposing an approach; read Part B for
   which course material governs pipeline placement, CASL, cron/queue
   choice, and testing conventions relevant to the feature.
5. `docs/week-3-plan.md` and `docs/week-4-plan.md` — read only as **format**
   templates (phase structure, checkbox wording, the "How to use this file"
   preamble, the "Notes" convention). Do not reuse their content.

Use the Explore agent (or direct `grep`/`find`) to locate the current code
seams the feature will touch — e.g. for a new role: the `Role` enum in
`prisma/schema.prisma`, `src/casl/casl-ability.factory.ts`, the roles
guard/decorator, and any service enforcing state transitions (such as
`OrderStatus` advances in `src/orders/orders.service.ts`). List these file
paths in the plan's **Code seams this feature touches** section so a later
`/implement-step` run does not have to re-discover them.

While gathering context, also track two other things as you go, for the
**Decisions this plan assumes** section:

- Any non-obvious choice you make in shaping the plan (a data-model shape, an
  endpoint boundary, a reuse-vs-new-endpoint call) that you are *not* going to
  escalate to the user — write it down as an assumed decision with its
  rationale, rather than letting it live only implicitly in how a step is
  worded.
- Any choice that genuinely has no clearly-better default (a product/policy
  call, e.g. who is allowed to perform a new transition) — that is an *open*
  decision: list it under **Open decisions** and name which phase/step is
  blocked on it, instead of silently picking one.

### 2. Decide phases and steps

Break the feature into phases that are roughly sequential (schema/migration
first, then application logic, then tests, then docs/OpenAPI sync), mirroring
`docs/week-4-plan.md`'s `Phase 0 — Setup`, `Phase 1 — ...` structure. Within
each phase, write steps as a `- [ ]` checklist. A step is well-sized when:

- It touches one concern (e.g. "add `deliveryPerson` to the `Role` enum and
  regenerate the Prisma client" is one step; "add the role, the CASL
  abilities, and the guard changes" is three).
- It can be verified independently (its own test file or a clear subset of
  an existing one).
- Its own unit/e2e test coverage can be named up front (which `*.spec.ts` or
  `*.e2e-spec.ts` file gets new cases).

Always include a step for regenerating a hand-edited migration
(`npx prisma migrate dev --create-only`, per `implementation-notes.md` §1 —
never `db push`) whenever the feature needs new enum values, tables, or
constraints. Always include a step for updating `docs/db-schema.md` and
`docs/openapi.yaml` to keep them the source of truth, since a feature drawn
from the excluded-scope list is by definition undocumented there.

### 3. Write the plan file

Create `docs/<feature-slug>-plan.md` using `references/plan-template.md` as
the skeleton — copy its structure, replace the placeholders, and delete the
instructional comments. Keep the same conventions as
`docs/week-4-plan.md`:

- A `**Goal:**` line summarizing what closes out when every box is ticked.
- A `**How to use this file**` block, unchanged in spirit: checkboxes are
  ticked only when tests + lint + typecheck pass, phases are roughly
  sequential but steps within a phase can be reordered, and `Notes` holds
  only what a later session would be wrong without (deviations, blockers,
  decisions taken on the fly) — never a summary of work already visible in
  the code.
- A **Decisions this plan assumes** section (with its **Open decisions**
  subsection) and a **Code seams this feature touches** section, filled from
  what you tracked in step 1 — don't leave these as empty placeholders; a
  feature with genuinely zero assumed or open decisions is the only case
  where a subsection is dropped, and code seams should always be populated.
- One `## Phase N — <name>` section per phase, each with its own `- [ ]`
  steps and its own `**Notes:**` subsection (left empty until
  `/implement-step` fills it in).

### 4. Report back

State the path of the plan file created, the number of phases/steps, and
which steps are blocked on an **open decision** the user needs to make (e.g.
whether `delivered` needs its own webhook or is set manually by the
delivery-person) — list them, mirroring the plan's own **Open decisions**
section. Do not implement anything and do not tick any checkbox — that is
`/implement-step`'s job.

## Additional Resources

- **`references/plan-template.md`** — the exact skeleton to copy for the new
  plan file, annotated with what goes in each section.
