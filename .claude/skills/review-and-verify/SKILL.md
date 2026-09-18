---
name: review-and-verify
description: This skill should be used when the user asks to "review this change", "check my code before commit", "run the checks and review it", "QA this", or after a code change made by /implement-step and before committing it. Runs the project's real executable checks (lint, typecheck, unit, e2e) and reports pass/fail, then reviews the diff for standards/spec compliance, missing test coverage, and future bottlenecks — delegating any missing tests to a fresh subagent instead of writing them itself.
disallowed-tools: Bash(git commit *)
---

# Review and Verify a Change

Run this after implementing something (typically after `/implement-step`,
but also for any pending diff) and before committing. It has two halves
that always run together: **executable checks** (the mandatory,
deterministic half) and a **review** of the diff for correctness, test
coverage, and future problems.

This skill deliberately overlaps with the repo's existing `code-review` and
`simplify` skills — reuse their angles (Standards vs. Spec, and
reuse/simplification/efficiency) rather than re-deriving a review
methodology from scratch. What this skill adds on top of those is: it
actually executes the checks and reports real output, it targets this
repo's known risk areas (see `references/risk-areas.md`), and it closes the
loop by delegating any missing test coverage to a subagent.

## When to use this skill

Invoke as `/review-and-verify [--since <ref>] [--skip-e2e]`. With no
arguments, review the working tree diff against `HEAD`; `--since <ref>`
reviews everything since that commit/branch point instead (use the
branch's starting commit recorded in `docs/ai-module/writeup.md` to review
the whole feature at once). `--skip-e2e` skips the e2e run only when Docker
is confirmed unavailable — state that explicitly in the report, since e2e
against real Postgres is a hard requirement per `CLAUDE.md`, not optional.

## Workflow

### 1. Run the executable checks first

Run `.claude/skills/review-and-verify/scripts/run-checks.sh` (add
`--skip-e2e` only if Docker is confirmed down). This runs, in order:
`npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, and
prints a markdown table of pass/fail plus log locations for any failure.
Include this table verbatim in the final report — do not paraphrase pass
counts.

If this is a pre/post comparison (verifying a specific fix, per the
assignment's "show a check failing before a fix, succeeding after"), run
the script once against the pre-fix state (e.g. `git stash` the fix, or
check out the commit before it) and once after, and show both tables side
by side.

### 2. Determine the diff scope

Get the diff (`git diff <ref>...HEAD` or the working tree diff) and the
list of changed files. This is the scope for the rest of the review — do
not review unrelated pre-existing code.

### 3. Review for standards and spec compliance

For each changed file, check:

- **Standards** — does it follow this repo's documented conventions?
  `.js` extensions on relative imports (ESM/nodenext), no code comments
  beyond a rare non-obvious WHY, Prisma client imported from
  `src/generated/prisma`, DTOs validated per `CLAUDE.md`'s mandatory-guards/
  pipes/decorators list.
- **Spec** — does it match `docs/db-schema.md`, `docs/openapi.yaml`, and
  `docs/implementation-notes.md`'s settled decisions? A change that
  contradicts a settled decision without recording a new one in that log is
  a finding, not a style nit.
- **Risk areas specific to this repo** — read
  `references/risk-areas.md` and check every item that applies to the
  changed files (CASL ability leaks, missing partial indexes/CHECK
  constraints, order-status transition gaps, N+1 queries on new list
  endpoints).

### 4. Check test coverage

For every changed service/controller, confirm a `*.spec.ts` (and, for
auth/checkout/order-history paths, an `*.e2e-spec.ts`) exists and covers:
the success path, the documented error cases, and at least one edge case
(unauthorized role, boundary value, duplicate/conflicting state). If
coverage is missing, **do not write the missing tests directly** — spawn a
fresh subagent via the Agent tool, following the same delegation contract
as `/implement-step`'s step 4 (interface + expected behavior from `docs/`
only, never the implementation). This keeps the "tests free of the
implementer's blind spots" property even when the gap is caught late.

### 5. Report

Structure the final report as:

1. **Executable checks** — the table(s) from step 1, verbatim.
2. **Findings** — most severe first, each with: file/line, what's wrong,
   the concrete failure scenario (bad input/state → wrong output), and
   whether it's Standards, Spec, or a bottleneck/future-risk finding.
3. **Test coverage** — gaps found and whether a subagent was spawned to
   close them (and that subagent's result).
4. **Verdict** — ready to commit, or blocked on which finding(s).

Do not commit on this skill's own authority — report and let the user (or
the next explicit instruction) decide.

## Additional Resources

- **`references/risk-areas.md`** — this repo's specific bottleneck/leak
  checkpoints (CASL, order-status transitions, migration constraints) to
  check on every review.
- **`scripts/run-checks.sh`** — the executable-checks runner used in step 1.
