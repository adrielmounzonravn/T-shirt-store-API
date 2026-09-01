import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { Role, OrderStatus } from '../src/generated/prisma/enums.js';
import {
  closeTestApp,
  createTestApp,
  resetDatabase,
  seedUser,
  signAccessToken,
  type TestApp,
} from './e2e/test-app.js';

describe('Orders (e2e)', () => {
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

  async function authClient(): Promise<{ token: string; userId: string }> {
    const user = await seedUser(testApp.prisma, { role: Role.client });
    return { token: signAccessToken(testApp.app, user), userId: user.id };
  }

  async function authManager(): Promise<{ token: string; userId: string }> {
    const user = await seedUser(testApp.prisma, { role: Role.manager });
    return { token: signAccessToken(testApp.app, user), userId: user.id };
  }

  async function createSellableVariant(
    overrides: { price?: number } = {},
  ): Promise<{ productId: string; skuId: string }> {
    const product = await testApp.prisma.product.create({
      data: {
        name: 'Test T-Shirt',
        status: 'enabled',
      },
    });

    const variant = await testApp.prisma.productVariant.create({
      data: {
        productId: product.id,
        size: 'm',
        color: 'black',
        fit: 'regular',
        gender: 'unisex',
        stock: 10,
        price: overrides.price ?? 25.5,
        status: 'enabled',
      },
    });

    return { productId: product.id, skuId: variant.id };
  }

  async function createOrderForUser(
    userId: string,
    options: {
      status?: OrderStatus;
      unitPrice?: number;
      quantity?: number;
      createdAt?: Date;
      paymentLink?: string | null;
      paymentIntent?: string | null;
      cartStatus?: 'confirmed' | 'expired';
    } = {},
  ): Promise<string> {
    const { skuId } = await createSellableVariant();
    const unitPrice = options.unitPrice ?? 25.5;
    const quantity = options.quantity ?? 1;

    const cart = await testApp.prisma.cartNumber.create({
      data: {
        userId,
        status: options.cartStatus ?? 'confirmed',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await testApp.prisma.cartProduct.create({
      data: {
        cartNumber: cart.cartNumber,
        skuId,
        quantity,
        unitPrice,
      },
    });

    const order = await testApp.prisma.order.create({
      data: {
        cartNumber: cart.cartNumber,
        idempotencyKey: randomUUID(),
        status: options.status ?? OrderStatus.pending,
        paymentLink:
          options.paymentLink ?? 'https://checkout.stripe.com/pay/test',
        paymentIntent: options.paymentIntent ?? null,
        ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      },
    });

    return order.id;
  }

  describe('GET /orders', () => {
    it('returns 401 without an Authorization header', async () => {
      await request(server()).get('/orders').expect(401);
    });

    it('returns 401 with an invalid token', async () => {
      await request(server())
        .get('/orders')
        .set('Authorization', 'Bearer not-a-valid-token')
        .expect(401);
    });

    it('client only sees their own orders, ignoring the userId filter', async () => {
      const { token, userId } = await authClient();
      const { userId: otherUserId } = await authClient();
      await createOrderForUser(userId);
      await createOrderForUser(otherUserId);

      const response = await request(server())
        .get('/orders')
        .query({ userId: otherUserId })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as {
        data: { userId: string }[];
        pagination: { limit: number; offset: number; total: number };
      };

      expect(body.data).toHaveLength(1);
      expect(body.data[0].userId).toBe(userId);
      expect(body.pagination.total).toBe(1);
    });

    it('manager sees orders across all clients', async () => {
      const { token } = await authManager();
      const { userId: userA } = await authClient();
      const { userId: userB } = await authClient();
      await createOrderForUser(userA);
      await createOrderForUser(userB);

      const response = await request(server())
        .get('/orders')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as {
        data: { userId: string }[];
        pagination: { total: number };
      };

      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
    });

    it('manager narrows results with ?userId=', async () => {
      const { token } = await authManager();
      const { userId: userA } = await authClient();
      const { userId: userB } = await authClient();
      await createOrderForUser(userA);
      await createOrderForUser(userB);

      const response = await request(server())
        .get('/orders')
        .query({ userId: userA })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as { data: { userId: string }[] };

      expect(body.data).toHaveLength(1);
      expect(body.data[0].userId).toBe(userA);
    });

    it('filters by status', async () => {
      const { token, userId } = await authClient();
      await createOrderForUser(userId, { status: OrderStatus.pending });
      await createOrderForUser(userId, { status: OrderStatus.paid });

      const response = await request(server())
        .get('/orders')
        .query({ status: OrderStatus.paid })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as { data: { status: string }[] };

      expect(body.data).toHaveLength(1);
      expect(body.data[0].status).toBe(OrderStatus.paid);
    });

    it('filters by dateFrom/dateTo', async () => {
      const { token, userId } = await authClient();
      await createOrderForUser(userId, {
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const inRangeId = await createOrderForUser(userId, {
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      });
      await createOrderForUser(userId, {
        createdAt: new Date('2026-12-01T00:00:00.000Z'),
      });

      const response = await request(server())
        .get('/orders')
        .query({
          dateFrom: '2026-03-01T00:00:00.000Z',
          dateTo: '2026-09-01T00:00:00.000Z',
        })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as { data: { orderId: string }[] };

      expect(body.data).toHaveLength(1);
      expect(body.data[0].orderId).toBe(inRangeId);
    });

    it('filters by minPrice/maxPrice on the order total', async () => {
      const { token, userId } = await authClient();
      await createOrderForUser(userId, { unitPrice: 10, quantity: 1 });
      const midId = await createOrderForUser(userId, {
        unitPrice: 25,
        quantity: 2,
      });
      await createOrderForUser(userId, { unitPrice: 100, quantity: 1 });

      const response = await request(server())
        .get('/orders')
        .query({ minPrice: 40, maxPrice: 60 })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as {
        data: { orderId: string; totalAmount: number }[];
      };

      expect(body.data).toHaveLength(1);
      expect(body.data[0].orderId).toBe(midId);
      expect(body.data[0].totalAmount).toBe(50);
    });

    it('combines filters', async () => {
      const { token, userId } = await authClient();
      const matchId = await createOrderForUser(userId, {
        status: OrderStatus.paid,
        unitPrice: 20,
        quantity: 1,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      });
      await createOrderForUser(userId, {
        status: OrderStatus.pending,
        unitPrice: 20,
        quantity: 1,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      });
      await createOrderForUser(userId, {
        status: OrderStatus.paid,
        unitPrice: 200,
        quantity: 1,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      });

      const response = await request(server())
        .get('/orders')
        .query({
          status: OrderStatus.paid,
          minPrice: 10,
          maxPrice: 50,
          dateFrom: '2026-01-01T00:00:00.000Z',
          dateTo: '2026-12-31T00:00:00.000Z',
        })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as { data: { orderId: string }[] };

      expect(body.data).toHaveLength(1);
      expect(body.data[0].orderId).toBe(matchId);
    });

    it('paginates with limit/offset and reports total independent of page size', async () => {
      const { token, userId } = await authClient();
      for (let i = 0; i < 5; i += 1) {
        await createOrderForUser(userId);
      }

      const response = await request(server())
        .get('/orders')
        .query({ limit: 2, offset: 1 })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as {
        data: unknown[];
        pagination: { limit: number; offset: number; total: number };
      };

      expect(body.data).toHaveLength(2);
      expect(body.pagination).toEqual({ limit: 2, offset: 1, total: 5 });
    });

    it('returns 400 for a non-UUID userId', async () => {
      const { token } = await authManager();

      await request(server())
        .get('/orders')
        .query({ userId: 'not-a-uuid' })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('returns 400 when limit exceeds 100', async () => {
      const { token } = await authClient();

      await request(server())
        .get('/orders')
        .query({ limit: 101 })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('returns 400 for a negative offset', async () => {
      const { token } = await authClient();

      await request(server())
        .get('/orders')
        .query({ offset: -1 })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('returns an empty result set with correct pagination when nothing matches', async () => {
      const { token } = await authClient();

      const response = await request(server())
        .get('/orders')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as {
        data: unknown[];
        pagination: { limit: number; offset: number; total: number };
      };

      expect(body.data).toEqual([]);
      expect(body.pagination).toEqual({ limit: 20, offset: 0, total: 0 });
    });
  });

  describe('GET /orders/:orderId', () => {
    it('returns 401 without an Authorization header', async () => {
      await request(server()).get(`/orders/${randomUUID()}`).expect(401);
    });

    it('client can fetch their own order with items', async () => {
      const { token, userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        unitPrice: 30,
        quantity: 2,
      });

      const response = await request(server())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as {
        orderId: string;
        userId: string;
        items: {
          skuId: string;
          quantity: number;
          unitPrice: number;
          lineTotal: number;
        }[];
      };

      expect(body.orderId).toBe(orderId);
      expect(body.userId).toBe(userId);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].quantity).toBe(2);
      expect(body.items[0].unitPrice).toBe(30);
      expect(body.items[0].lineTotal).toBe(60);
    });

    it('returns 403 when a client fetches another client order', async () => {
      const { token } = await authClient();
      const { userId: otherUserId } = await authClient();
      const orderId = await createOrderForUser(otherUserId);

      await request(server())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('manager can fetch any client order', async () => {
      const { token } = await authManager();
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId);

      const response = await request(server())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as { orderId: string };
      expect(body.orderId).toBe(orderId);
    });

    it('returns 404 for an unknown orderId', async () => {
      const { token } = await authClient();

      await request(server())
        .get(`/orders/${randomUUID()}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('returns 400 for a non-UUID orderId path param', async () => {
      const { token } = await authClient();

      await request(server())
        .get('/orders/not-a-uuid')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('PATCH /orders/:orderId/status', () => {
    it('returns 401 without an Authorization header', async () => {
      await request(server())
        .patch(`/orders/${randomUUID()}/status`)
        .send({ status: 'processing' })
        .expect(401);
    });

    it('manager advances paid to processing', async () => {
      const { token } = await authManager();
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.paid,
      });

      const response = await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'processing' })
        .expect(200);

      const body = response.body as { status: string };
      expect(body.status).toBe(OrderStatus.processing);

      const dbOrder = await testApp.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(dbOrder.status).toBe(OrderStatus.processing);
    });

    it('manager advances processing to shipped', async () => {
      const { token } = await authManager();
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.processing,
      });

      const response = await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'shipped' })
        .expect(200);

      const body = response.body as { status: string };
      expect(body.status).toBe(OrderStatus.shipped);
    });

    it('returns 422 for an out-of-flow transition from pending', async () => {
      const { token } = await authManager();
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.pending,
      });

      await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'processing' })
        .expect(422);
    });

    it('returns 422 for an out-of-flow transition when already shipped', async () => {
      const { token } = await authManager();
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.shipped,
      });

      await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'shipped' })
        .expect(422);
    });

    it('returns 422 when the order is cancelled', async () => {
      const { token } = await authManager();
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.cancelled,
      });

      await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'processing' })
        .expect(422);
    });

    it('returns 403 when a client attempts this endpoint on their own order', async () => {
      const { token, userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.paid,
      });

      await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'processing' })
        .expect(403);
    });

    it('returns 404 for an unknown orderId', async () => {
      const { token } = await authManager();

      await request(server())
        .patch(`/orders/${randomUUID()}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'processing' })
        .expect(404);
    });

    it('returns 400 for an invalid status value', async () => {
      const { token } = await authManager();
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.paid,
      });

      await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'pending' })
        .expect(400);
    });

    it('returns 400 for a status value that is not part of the enum', async () => {
      const { token } = await authManager();
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.paid,
      });

      await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'shipped2' })
        .expect(400);
    });

    it('returns 400 for a non-UUID orderId path param', async () => {
      const { token } = await authManager();

      await request(server())
        .patch('/orders/not-a-uuid/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'processing' })
        .expect(400);
    });
  });

  describe('PATCH /orders/:orderId/cancel', () => {
    it('returns 401 without an Authorization header', async () => {
      await request(server())
        .patch(`/orders/${randomUUID()}/cancel`)
        .expect(401);
    });

    it('client cancels their own order in pending', async () => {
      const { token, userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.pending,
      });

      const response = await request(server())
        .patch(`/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as { status: string };
      expect(body.status).toBe(OrderStatus.cancelled);

      const dbOrder = await testApp.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(dbOrder.status).toBe(OrderStatus.cancelled);
    });

    it('client cancels their own order in processing', async () => {
      const { token, userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.processing,
      });

      const response = await request(server())
        .patch(`/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as { status: string };
      expect(body.status).toBe(OrderStatus.cancelled);
    });

    it('returns 422 when cancelling an already shipped order', async () => {
      const { token, userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.shipped,
      });

      await request(server())
        .patch(`/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(422);
    });

    it('returns 422 when cancelling an already cancelled order', async () => {
      const { token, userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.cancelled,
      });

      await request(server())
        .patch(`/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(422);
    });

    it('returns 403 when a client attempts to cancel another client order', async () => {
      const { token } = await authClient();
      const { userId: otherUserId } = await authClient();
      const orderId = await createOrderForUser(otherUserId, {
        status: OrderStatus.pending,
      });

      await request(server())
        .patch(`/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('returns 403 when a manager attempts this endpoint', async () => {
      const { token } = await authManager();
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.pending,
      });

      await request(server())
        .patch(`/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('returns 404 for an unknown orderId', async () => {
      const { token } = await authClient();

      await request(server())
        .patch(`/orders/${randomUUID()}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('returns 400 for a non-UUID orderId path param', async () => {
      const { token } = await authClient();

      await request(server())
        .patch('/orders/not-a-uuid/cancel')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });
});
