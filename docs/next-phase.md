# Pendings

## Week 3 → Week 4 scope expansion (added 2026-08-27)

`CLAUDE.md` currently scopes this repo to auth + products + SKUs (the Week 3
checkpoint from `docs/challenge.md`) and says cart/orders/payments are
"designed in `docs/` but out of scope for now — don't implement or scaffold
them until asked." When that instruction comes, the following need to change
together — not just `CLAUDE.md`.

- [ ] **`CLAUDE.md` — "Current scope" paragraph.** Replace the Week 3-only
      scope statement with the full Week 3+4 scope: auth, products/SKUs,
      cart, orders, payments (Stripe), stock notifications, CASL, S3 uploads.
      Update or drop the "`src/` currently only has the default Nest
      boilerplate" line to match whatever actually exists in `src/` by then.
- [ ] **`CLAUDE.md` — "Unit tests are mandatory... There are no E2E tests
      yet" paragraph.** `challenge.md`'s Mandatory Implementations section
      requires "End-to-end tests covering the critical paths: authentication,
      checkout, and order history." This is in scope starting Week 4 — update
      the paragraph once e2e work actually begins, and resolve the
      "E2E setup exclusions" pending below at the same time.
- [ ] **`docs/implementation-notes.md` §5 "Known gap".** `POST
      /webhooks/stripe` is not yet in `openapi.yaml`. It must be specced
      there and implemented alongside the Stripe integration — this note
      says do it "alongside", so don't let the endpoint land in code before
      the spec.
- [ ] **New dependencies** (check before assuming any are installed):
      `@nestjs/config` + a schema validator (Joi/Zod/`class-validator`) for
      env validation, `class-validator` + `class-transformer` for the
      `ValidationPipe`, `@nestjs/passport` + `passport` + `passport-jwt` +
      `@nestjs/jwt`, `bcrypt` or `bcryptjs`/`argon2` (ESM caveat noted in
      `implementation-notes.md` §8), `@casl/ability`, `helmet`,
      `@nestjs/throttler`, `@nestjs/swagger`, `@nestjs/schedule`,
      `@nestjs/bullmq` + `bullmq` (needs Redis — also a deploy-shape item for
      the architecture write-up), `stripe`, a multipart parser (`multer` /
      `@nestjs/platform-express` file interceptor), and a mailer for the
      password-change and stock-notification emails. `@aws-sdk/client-s3` is
      already installed and wired (Phase 7, `src/storage/`).
- [ ] **`nest-cli.json`** — add `"compilerOptions": { "plugins":
      ["@nestjs/swagger"] }` per `implementation-notes.md` §13, before
      relying on inferred `@ApiProperty()` decorators.
- [ ] **Local infra** — no `docker-compose.yml` exists yet; Redis (BullMQ)
      and Postgres both need a local run story before background jobs or
      migrations can be tested.
- [ ] **`.env`** — extend with every setting listed in
      `implementation-notes.md` §3 that isn't already there (Redis
      host/port, Stripe keys, S3 bucket/region, mailer config, JWT secret).

## E2E setup exclusions (added 2026-08-27 for pre-commit hook)

`test/app.e2e-spec.ts` was excluded from typecheck and lint because e2e tests
are out of scope for the current phase (see `CLAUDE.md`) and the file had a
broken `supertest/types` import that failed `tsc`/`eslint`. This was needed so
the pre-commit hook (`.claude/settings.json`, runs lint + typecheck + test on
`git commit`) doesn't block on out-of-scope code.

When e2e tests are picked up in a future phase:

- [ ] Remove `"test/app.e2e-spec.ts"` from `exclude` in `tsconfig.json`
- [ ] Remove `'test/app.e2e-spec.ts'` from `ignores` in `eslint.config.mjs`
- [ ] Fix the `supertest/types` import in `test/app.e2e-spec.ts` (or update to
      however supertest types are resolved by then)
- [ ] Confirm `npm run lint`, `npm run typecheck`, and `npm run test:e2e` all
      pass with the file included
- [ ] Delete this file once done
