# Test-delegation prompt template

Use this shape when spawning the test-writing subagent in step 4 of
`SKILL.md`. Fill in the brackets; do not add anything from the
implementation beyond the public interface.

```
Write [unit tests in <file>.spec.ts | e2e tests in <file>.e2e-spec.ts] for
<module/service name>.

Public interface:
<exported class/function signatures, DTOs, types — paste them verbatim>

Expected behavior:
<paste the relevant paragraph(s) from docs/db-schema.md, docs/openapi.yaml,
or the plan step's own wording — not a description of how the code works
internally>

Framework/conventions:
- Unit tests use vitest + @nestjs/testing, run via `npx vitest run <path>`.
- E2E tests use the Testcontainers-backed Postgres harness in
  test/e2e/test-app.ts (createTestApp/resetDatabase/seedUser/
  signAccessToken) — never mock the database.
- Cover the success path, the documented error/edge cases, and at least one
  case an implementer would plausibly forget (e.g. an unauthorized role, a
  boundary value, a duplicate/conflicting state).

Do not read the implementation file(s) for <module name> — write the tests
from the interface and expected behavior above only.
```

## Worked example — CASL ability for a new role

```
Write unit tests in src/casl/casl-ability.factory.spec.ts for the
deliveryPerson branch of CaslAbilityFactory.createForUser.

Public interface:
CaslAbilityFactory.createForUser(user: { id: string; role: Role }): AppAbility
Role enum values: manager, client, deliveryPerson

Expected behavior:
A deliveryPerson can read Orders assigned to them and update only an
order's status field (shipped -> delivered). A deliveryPerson cannot read
or modify any other user's Order, cannot access Product/SKU management,
and cannot advance status past `delivered`.

Framework/conventions:
- vitest + @nestjs/testing, run via `npx vitest run src/casl/casl-ability.factory.spec.ts`.
- Cover: assigned-order read/update allowed; other user's order denied;
  Product management denied; status advance beyond `delivered` denied.

Do not read src/casl/casl-ability.factory.ts — write the tests from the
interface and expected behavior above only.
```
