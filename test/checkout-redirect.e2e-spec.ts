import type { Server } from 'node:http';
import request from 'supertest';
import {
  closeTestApp,
  createTestApp,
  resetDatabase,
  type TestApp,
} from './e2e/test-app.js';

describe('Checkout redirect (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
  });

  const server = (): Server => testApp.app.getHttpServer() as Server;

  describe('GET /checkout/success', () => {
    it('returns 200 with a message and no Authorization header', async () => {
      const response = await request(server())
        .get('/checkout/success')
        .expect(200);

      const body = response.body as { message: string };
      expect(typeof body.message).toBe('string');
      expect(body.message.length).toBeGreaterThan(0);
    });
  });

  describe('GET /checkout/cancel', () => {
    it('returns 200 with a message and no Authorization header', async () => {
      const response = await request(server())
        .get('/checkout/cancel')
        .expect(200);

      const body = response.body as { message: string };
      expect(typeof body.message).toBe('string');
      expect(body.message.length).toBeGreaterThan(0);
    });
  });
});
