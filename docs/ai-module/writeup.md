# AI Module - Write-Up

> Save as `docs/ai-module/writeup.md`. Short answers and links are enough.

**Repository / PR:** T-shirt-store-API — branch `ai-module/delivery-person-role`
**Starting commit:** `a5cd03d95eb4629792c8ce244c18034308435164`
**Improvement:** Picked up the **Delivery Person role** from `docs/challenge.md`'s excluded-scope list: a third `Role` with orders assigned to it, a `shipped → delivered` status transition, and delivery history — closing the last challenge feature that was still marked out of scope. It works because every phase (schema, CASL, assignment endpoint, status transition, read-path scoping) has unit tests plus a dedicated `test/deliveries.e2e-spec.ts` and extended `test/orders.e2e-spec.ts` cases, all run against a real Postgres Testcontainer, and `docs/db-schema.md` / `docs/openapi.yaml` / `docs/implementation-notes.md` are updated to describe it — see Evidence below.

## Skills

| Skill (file link) | Goal, inputs → steps → output | Exact invocation |
| --- | --- | --- |
| [plan-feature](../../.claude/skills/plan-feature/SKILL.md) | Goal: turn a feature request into a phased, checkbox-driven plan without writing any code. Input: a one-line feature description. Steps: read `docs/challenge.md`/`db-schema.md`/`openapi.yaml`/`implementation-notes.md` in order, list the concrete code seams the feature touches, break it into sequential phases sized so each step is one `/implement-step` run. Output: `docs/delivery-person-plan.md`, a checklist matching the format of the closed `docs/week-3-plan.md`/`week-4-plan.md`. | `/plan-feature Add the Delivery Person role from docs/challenge.md's excluded scope: assigned orders, delivery history, shipped -> delivered status.` |
| [implement-step](../../.claude/skills/implement-step/SKILL.md) | Goal: implement exactly one `- [ ]` checklist item end to end without scope creep into neighboring steps. Input: a plan file plus a step reference (or `next`). Steps: locate the step, read the governing settled-decisions/course-mapping section of `implementation-notes.md`, write the minimum code, delegate `*.spec.ts`/`*.e2e-spec.ts` writing to a **fresh subagent that only sees the public interface and `docs/`-derived expected behavior, never the implementation**, run lint/typecheck/the new specs, then tick the box. Output: implemented step, its tests, green checks, an updated plan file. | `/implement-step docs/delivery-person-plan.md next` (run once per phase step, e.g. `"cuarta tarea de la fase 7"` for this docs-sync step) |
| [review-and-verify](../../.claude/skills/review-and-verify/SKILL.md) | Goal: gate a change before commit with both real executable checks and a standards/spec review. Input: a diff (working tree, or `--since <ref>` for the whole branch). Steps: run `scripts/run-checks.sh` (lint, typecheck, unit, e2e) and report the table verbatim, review the diff against this repo's risk areas (CASL leaks, missing partial indexes/CHECK constraints, order-status transition gaps), check test coverage per changed file and spawn a fresh test-writing subagent for any gap instead of writing tests itself. Output: a pass/fail table, ranked findings, a coverage report, and a commit/blocked verdict. | `/review-and-verify --since a5cd03d95eb4629792c8ce244c18034308435164` |

**Notes:** `implement-step` and `review-and-verify` both reuse the same subagent-delegation contract from `CLAUDE.md` (tests written by a subagent that never sees the implementation), so `review-and-verify` closing a coverage gap late still preserves that property instead of falling back to the implementer patching its own tests. No rollback tooling needed for code: every phase lands as its own small, reviewable commits (per `CLAUDE.md`'s commit-granularity rule), so a bad code-level phase reverts with `git revert` on its own commits without touching the rest. The one exception is Phase 0's migration: its two `ALTER TYPE ... ADD VALUE` statements (adding `deliveryPerson` to `Role` and `delivered` to `OrderStatus`) can't be undone by `git revert` or any migration, since Postgres has no way to drop an enum value once added. All three skills were added fresh in `182e045` (not modifications of pre-existing skills).

### Baseline (recorded on branch creation, at the starting commit above)

| Check | Command | Result |
| --- | --- | --- |
| Build | `npm run build` | OK |
| Lint | `npm run lint` | OK — 6 pre-existing `no-unsafe-argument` warnings, 0 errors |
| Unit tests | `npm test` | 485/485 passing (28 files) |
| E2E tests | `npm run test:e2e` | 93/93 passing (7 files) |

### Current state (commit `81ac52e`, this step's HEAD) — real `run-checks.sh` output

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | OK |
| Typecheck | `npm run typecheck` | OK |
| Unit tests | `npm test` | OK |
| E2E tests | `npm run test:e2e` | OK |

Run 2026-09-18 via `bash .claude/skills/review-and-verify/scripts/run-checks.sh`, Docker running for the e2e Testcontainer. The script's `Result` column is only ever `OK`, `FAIL (see <path>)`, or `SKIPPED` — it does not print pass counts. The underlying `npm test`/`npm run test:e2e` output for that same run reported **559/559 passing (32 files)** and **132/132 passing (8 files)** respectively (see Evidence below).

## Project Results

**Before → after:**

- **Manual workflow** for a feature this size (new `Role`, new `OrderStatus` value, a new FK with a CHECK constraint, CASL branch restructuring, a new manager endpoint, per-actor status-transition rules, read-path scoping, e2e coverage, doc sync across three files) would normally mean holding all of it in one long session, writing tests myself (with my own implementation blind spots baked into them), and re-deriving decisions (e.g. "who may set `delivered`?") mid-flight because nothing forced them to be written down first.
- **`plan-feature`** front-loaded that: it read `docs/challenge.md` §149-156, `db-schema.md`, `openapi.yaml`, and `implementation-notes.md`'s settled-decisions log before writing a single line of the plan, and it explicitly flagged two **open decisions** (who may set `delivered`; whether to add per-order status history) instead of silently guessing — those became `docs/delivery-person-plan.md`'s "Open decisions" section, which is exactly where my judgment was needed (I resolved decision 1 in Phase 4: only the assigned delivery person, not the Manager, may set `delivered`; left decision 2's Phase 8 unticked as out of the two-day sizing).
- **`implement-step`** kept each of the 27 checked boxes across Phases 0-7 to one concern each, so every commit in the branch history maps to exactly one checklist item (`git log --oneline main..HEAD`), and it caught a real sequencing bug on its own: Phase 0's CHECK constraint (`shipped`/`delivered` orders must carry an assignee) was added before Phase 4 could satisfy it, so `npm run test:e2e` was red for 3 pre-existing cases between Phase 0 and Phase 4 — expected, and recorded in Phase 0's Notes instead of silently "fixed" out of order. My judgment was needed on sizing calls the skill can't make alone (e.g. deciding `deliveryPersonId` belongs on the shared `OrderEntity` rather than duplicated across `order-list`/`order-detail` entities, Phase 3's Notes).
- **`review-and-verify`** is what actually caught the delegated-test blind spot: the Phase 6 e2e subagents, given only the HTTP contract and harness conventions (never the CASL/service implementation), independently wrote a `processing → shipped` case that exposed the Phase 0/Phase 4 sequencing gap above as a real regression on `test/orders.e2e-spec.ts`'s existing "manager advances processing to shipped" test rather than something I had to notice by inspection. A `review-and-verify` pass over this same change also surfaced a separate real bug — Manager-created delivery-person accounts were born `isVerified: false` with no path to flip it, so they could never sign in — which was fixed the same way (see `docs/qa-delivery-person-local.md`'s "Bug found and fixed" section).

**Evidence:**

- Baseline (recorded at branch creation, commit `a5cd03d`): build OK; lint 0 errors/6 pre-existing warnings; unit 485/485 (28 files); e2e 93/93 (7 files) — see the Baseline table above.
- Current state (commit `81ac52e`, this step's HEAD): `npm run lint` OK, `npm run typecheck` OK — see the "Current state" table above, run for real via `run-checks.sh`; `npm test` → **559/559 passing (32 files)**, run 2026-09-18; `npm run test:e2e` → **132/132 passing (8 files)**, run 2026-09-18 against the real `postgres:17-alpine` Testcontainer (`test/e2e/global-setup.ts`), no mocked database. The one `[AllExceptionsFilter] Unhandled exception` line in the e2e output is expected: a deliberate raw-throw/unknown-error assertion in `all-exceptions.filter.spec.ts` and a stock-notification job test exercising a not-found path, not a real failure.
- Pre/post comparison for the sequencing bug: before Phase 4, `processing → shipped` in `orders.e2e-spec.ts` returned 200 with no assignee (the old behavior); `test/deliveries.e2e-spec.ts` and the Phase 6-extended `orders.e2e-spec.ts` now assert it 422s without a `deliveryPersonId` and 200s with one — both fresh subagent-written suites, not touched by the implementer.
- New e2e file: `test/deliveries.e2e-spec.ts` (Manager creates a delivery person → assigns a paid order → delivery person lists only their assigned orders → reads one → marks it `delivered` → is refused on an order that isn't theirs).
- Full commit trail: `git log --oneline a5cd03d..HEAD` in this repo, 37 commits total as of `81ac52e` — the original 3 skill/tooling commits (`182e045`, `b63bf00`, `442884d`), the 27 feature commits for Phases 0-7 plus doc sync (through `e78dd6b`), and 7 more commits since then covering this write-up itself, one review-caught bug fix (`98d4798`), and further doc/tooling fixes from GitHub issue #2 (`cb51650`, `4133ea8`, `81ac52e`), so not all 37 are "feature" commits in the original sense.

**Limitations:**

- Phase 8 (per-order status history table) is deliberately left unticked — the excluded-scope bullet couples `delivered` with "full status history," but the plan scoped that as an optional Open Decision to keep the change inside the two-day AI-module sizing, and it was not taken.
- No new notification is sent on assignment or on reaching `delivered` (by design — nothing in `docs/challenge.md` asks for one, and `MailService`/BullMQ were kept untouched, per the plan's recorded decisions).
- All three skills were exercised only inside this repo and this one feature; they haven't been tried on a differently-shaped change (e.g. a pure bug fix rather than new schema+CASL+endpoint), so their generality beyond this feature shape is untested.
