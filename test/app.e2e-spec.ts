import request from 'supertest';
import { closeTestApp, createTestApp, type TestApp } from './e2e/test-app.js';

// Harness smoke test, not feature coverage: proves the Testcontainers
// Postgres + full Nest bootstrap (guards, pipes, filters) actually works
// end to end. Feature e2e suites (auth, checkout, order history) are
// Phase 1/3/4/5 of `docs/week-4-plan.md`.
describe('Health (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  it('/health (GET) reports the database connection as healthy', () => {
    return request(testApp.app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
