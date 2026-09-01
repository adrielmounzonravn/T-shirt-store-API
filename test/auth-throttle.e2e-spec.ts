import type { Server } from 'node:http';
import request from 'supertest';
import { MailService } from '../src/mail/mail.service.js';
import type {
  closeTestApp as CloseTestApp,
  createTestApp as CreateTestApp,
  resetDatabase as ResetDatabase,
  TestApp,
} from './e2e/test-app.js';

describe('Auth throttling (e2e)', () => {
  let testApp: TestApp;
  let mailService: MailService;
  let closeTestApp: typeof CloseTestApp;
  let resetDatabase: typeof ResetDatabase;

  const RESET_PASSWORD_LIMIT = 3;

  beforeAll(async () => {
    process.env.THROTTLE_RESET_PASSWORD_LIMIT = String(RESET_PASSWORD_LIMIT);
    process.env.THROTTLE_RESET_PASSWORD_TTL = '60';

    // Must be a dynamic import: `AuthController`'s per-route throttle config
    // is a module-level constant read from `process.env` at import time, not
    // a DI-injected value, so it has to be evaluated after the overrides
    // above are set. This file's own module registry is isolated from other
    // e2e spec files, so this doesn't affect their throttle limits.
    const testAppModule = (await import('./e2e/test-app.js')) as {
      createTestApp: typeof CreateTestApp;
      closeTestApp: typeof CloseTestApp;
      resetDatabase: typeof ResetDatabase;
    };
    closeTestApp = testAppModule.closeTestApp;
    resetDatabase = testAppModule.resetDatabase;

    testApp = await testAppModule.createTestApp();
    mailService = testApp.app.get(MailService);
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const server = (): Server => testApp.app.getHttpServer() as Server;

  describe('POST /auth/forgot-password', () => {
    it('returns 429 once the per-route rate limit is exceeded', async () => {
      vi.spyOn(mailService, 'sendPasswordResetEmail').mockResolvedValue();

      for (let i = 0; i < RESET_PASSWORD_LIMIT; i++) {
        await request(server())
          .post('/auth/forgot-password')
          .send({ email: `nonexistent-${i}@example.com` })
          .expect(202);
      }

      await request(server())
        .post('/auth/forgot-password')
        .send({ email: 'one-too-many@example.com' })
        .expect(429);
    });
  });
});
