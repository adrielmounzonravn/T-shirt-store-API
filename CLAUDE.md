# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A NestJS + Prisma + PostgreSQL T-shirt store API (capstone project, see `docs/challenge.md`). `src/` currently only has the default Nest boilerplate (`AppController`/`AppService`/`AppModule`) — no domain modules exist yet.

**Current scope (this week's checkpoint): authentication, products, and SKUs/variants (basic catalog) only.** Cart, orders, and payments are designed in `docs/` but out of scope for now — don't implement or scaffold them until asked.

**Unit tests are mandatory alongside development.** Write and run `*.spec.ts` tests for each service as you build it, not afterward. There are no E2E tests yet — `test/app.e2e-spec.ts` and the e2e Vitest config exist but e2e coverage isn't part of current scope.

## Working checklist — `docs/week-3-plan.md`

The step-by-step plan for the current checkpoint, and the way sessions hand off context to each other. Read it before starting work to see what's done and what's next, and keep it current:

- **Tick the step you finished** (`[ ]` → `[x]`) as part of the same task — don't leave it for the user. Commit the step's work first (see **Git commits** below), then tick it in a follow-up commit — never bundle the checkbox flip into the same commit as the code.
- **Add a note only if a future session would be wrong without it**: a deviation from `docs/`, a blocker, a decision taken on the fly. One or two lines under that phase's **Notes**.
- **Don't** note what the code already shows, restate the docs, or log routine progress. Short and concise beats complete — the file loses its value once it's noise.
- If the plan itself turns out wrong, edit it (add/remove/reorder steps) rather than working around it.

## Design docs — the source of truth, read in this order

Everything about the data model, API contract, and architectural decisions already lives in `docs/`. Read from there instead of re-deriving or re-deciding — don't duplicate their content here or in code comments.

1. `docs/challenge.md` — full requirements, roles/CASL abilities, and the **Scope** section listing features deliberately excluded (delivery-person role, `delivered` status, promo codes).
2. `docs/db-schema.md` — the data model (DBML) plus a section on rules the schema can't express on its own (soft-delete filtering, sellability, etc.) that must be enforced in application code.
3. `docs/openapi.yaml` — the HTTP contract to implement against.
4. `docs/implementation-notes.md` — **Part A**: DBML→Prisma gaps that must be hand-added to migrations (partial indexes, CHECK constraints), background jobs, required env config, and a **"Settled decisions — do not re-litigate"** log (check it before proposing a different approach to something already decided there). **Part B**: the course material mapped onto this project — see below.

## Course material

The tutors' courses are the intended approach for this challenge. **Follow them whenever they cover the problem at hand** — this is a *should*, not a *must*: don't force a fit where the case clearly isn't what the course was solving, or where a better option exists. Deliberate exceptions are already recorded in `implementation-notes.md` §13.

**Part B of `docs/implementation-notes.md` is the entry point** — it summarizes what each course settles for this project (pipeline placement, Passport/CASL, config/validation/errors, cron vs queue vs event, testing, REST/Swagger discipline) and cites the exact source file for each. Read it first; only open the course itself when that summary isn't enough for what you're implementing.

Courses live in `~/webapp/src/content/cursos/backend/`. Each module's `modulo.mdx` opens with a one-screen summary — start there before the individual topics.

## Language

All project artifacts are in **English**: code, comments, commit messages, `docs/`, test names. Spanish is only for conversation with the user in chat when requested.

## Git commits

Commit frequently, splitting each task into the commits that make its history clearest — not one commit per task, not one per file:

- Group changes that belong together (e.g. a service plus its own `*.spec.ts`); split ones that don't (e.g. a new endpoint vs. an unrelated fix noticed along the way).
- A small, self-contained change (a config tweak, a one-line fix) is fine as a single commit — don't force it into more.
- A larger task — a new module, a multi-step feature — should land as several commits as the work progresses, not one squashed commit at the end.
- Don't commit just to have commits; only split when the split adds clarity.
- Messages: short, direct, imperative, descriptive — e.g. `Add ProductsService`, `Add unit tests for ProductsService`, `Fix SKU sellability check`. No filler, no multi-paragraph bodies for routine changes.

## Commands

```bash
npm run start:dev      # run with watch mode
npm run build           # nest build
npm run lint             # eslint --fix on src/ and test/
npm run format           # prettier --write on src/ and test/

npm test                 # vitest run — all *.spec.ts (unit tests)
npm run test:watch       # vitest watch mode
npm run test:cov         # vitest run --coverage
npx vitest run path/to/file.spec.ts   # run a single test file
npx vitest run -t "test name"          # run tests matching a name
```

Prisma:

```bash
npx prisma migrate dev --create-only --name <name>   # generate a migration to hand-edit (see implementation-notes.md §1)
npx prisma generate                                    # regenerate the client into src/generated/prisma
```

## Things worth knowing that aren't in `docs/`

- **ESM module resolution**: `package.json` sets `"type": "module"`, and TS uses `module`/`moduleResolution: nodenext`. Relative imports need the `.js` extension (e.g. `from './app.service.js'`) — this is required by nodenext, not a mistake to fix.
- **Prisma client output**: generated into `src/generated/prisma` (gitignored), not the default `node_modules/.prisma` — import the client from there.
- **Testing setup**: unit tests (`*.spec.ts`) run via `vitest.config.ts` with `@nestjs/testing`; e2e tests would use the separate `vitest.config.e2e.ts`, but aren't in scope yet.
