import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

// Runs once for the whole `test:e2e` run, before any suite file is loaded.
// It starts a real Postgres in Docker, points DATABASE_URL at it, and applies
// the repo's hand-edited SQL migrations (not `db push`, which would skip the
// partial indexes and CHECK constraints from `implementation-notes.md` §1).
//
// `process.env` mutated here is inherited by the worker processes Vitest
// spawns for the actual test files, since that spawn happens only after this
// function resolves.
export default async function setup(): Promise<() => Promise<void>> {
  loadEnv({ path: resolve(process.cwd(), '.env.test') });

  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:17-alpine',
  )
    .withDatabase('tshirt_store_e2e')
    .withUsername('tshirt_store_e2e')
    .withPassword('tshirt_store_e2e')
    .start();

  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  return async () => {
    await container.stop();
  };
}
