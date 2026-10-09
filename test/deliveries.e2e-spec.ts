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

describe('Deliveries (e2e)', () => {
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

  async function authDeliveryPerson(): Promise<{
    token: string;
    userId: string;
  }> {
    const user = await seedUser(testApp.prisma, {
      role: Role.deliveryPerson,
    });
    return { token: signAccessToken(testApp.app, user), userId: user.id };
  }

  async function createSellableVariant(
    overrides: { price?: number } = {},
  ): Promise<{ productId: string; skuId: string }> {
    const product = await testApp.prisma.product.create({
      data: { name: 'Test T-Shirt', status: 'enabled' },
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
      deliveryPersonId?: string | null;
    } = {},
  ): Promise<string> {
    const { skuId } = await createSellableVariant();
    const cart = await testApp.prisma.cartNumber.create({
      data: {
        userId,
        status: 'confirmed',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await testApp.prisma.cartProduct.create({
      data: {
        cartNumber: cart.cartNumber,
        skuId,
        quantity: options.quantity ?? 1,
        unitPrice: options.unitPrice ?? 25.5,
      },
    });
    const order = await testApp.prisma.order.create({
      data: {
        cartNumber: cart.cartNumber,
        idempotencyKey: randomUUID(),
        status: options.status ?? OrderStatus.pending,
        paymentLink: 'https://checkout.stripe.com/pay/test',
        deliveryPersonId: options.deliveryPersonId ?? null,
      },
    });
    return order.id;
  }

  async function createDeliveryPersonAccount(
    managerToken: string,
    overrides: { email?: string; fullName?: string } = {},
  ): Promise<{ userId: string; token: string; email: string }> {
    const email = overrides.email ?? `${randomUUID()}@example.com`;
    const response = await request(server())
      .post('/users')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        email,
        password: 'Password123!',
        fullName: overrides.fullName ?? 'Delivery Person',
        role: 'deliveryPerson',
      })
      .expect(201);

    const body = response.body as { userId: string };
    const user = await testApp.prisma.user.findUniqueOrThrow({
      where: { id: body.userId },
    });

    return {
      userId: body.userId,
      token: signAccessToken(testApp.app, user),
      email,
    };
  }

  describe('POST /users', () => {
    it('returns 401 without an Authorization header', async () => {
      await request(server())
        .post('/users')
        .send({
          email: `${randomUUID()}@example.com`,
          password: 'Password123!',
          fullName: 'Delivery Person',
          role: 'deliveryPerson',
        })
        .expect(401);
    });

    it('manager creates a delivery-person account', async () => {
      const { token } = await authManager();
      const email = `${randomUUID()}@example.com`;

      const response = await request(server())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email,
          password: 'Password123!',
          fullName: 'Delivery Person',
          role: 'deliveryPerson',
        })
        .expect(201);

      const body = response.body as {
        userId: string;
        email: string;
        fullName: string;
        role: string;
        isActive: boolean;
        isVerified: boolean;
        password?: string;
      };

      expect(body.userId).toBeDefined();
      expect(body.email).toBe(email);
      expect(body.fullName).toBe('Delivery Person');
      expect(body.role).toBe('deliveryPerson');
      expect(body.password).toBeUndefined();

      const dbUser = await testApp.prisma.user.findUniqueOrThrow({
        where: { id: body.userId },
      });
      expect(dbUser.role).toBe(Role.deliveryPerson);
    });

    it('returns 403 when a client attempts this endpoint', async () => {
      const { token } = await authClient();

      await request(server())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: `${randomUUID()}@example.com`,
          password: 'Password123!',
          fullName: 'Delivery Person',
          role: 'deliveryPerson',
        })
        .expect(403);
    });

    it('returns 403 when a delivery person attempts this endpoint', async () => {
      const { token } = await authDeliveryPerson();

      await request(server())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: `${randomUUID()}@example.com`,
          password: 'Password123!',
          fullName: 'Delivery Person',
          role: 'deliveryPerson',
        })
        .expect(403);
    });

    it('returns 400 when the role is not deliveryPerson', async () => {
      const { token } = await authManager();

      await request(server())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: `${randomUUID()}@example.com`,
          password: 'Password123!',
          fullName: 'Manager Attempt',
          role: 'manager',
        })
        .expect(400);
    });

    it('returns 400 for a password shorter than 8 characters', async () => {
      const { token } = await authManager();

      await request(server())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: `${randomUUID()}@example.com`,
          password: 'short',
          fullName: 'Delivery Person',
          role: 'deliveryPerson',
        })
        .expect(400);
    });

    it('returns 400 when a required field is missing', async () => {
      const { token } = await authManager();

      await request(server())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          password: 'Password123!',
          fullName: 'Delivery Person',
          role: 'deliveryPerson',
        })
        .expect(400);
    });

    it('returns 409 when the email is already in use', async () => {
      const { token } = await authManager();
      const email = `${randomUUID()}@example.com`;
      await createDeliveryPersonAccount(token, { email });

      await request(server())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email,
          password: 'Password123!',
          fullName: 'Another Delivery Person',
          role: 'deliveryPerson',
        })
        .expect(409);
    });
  });

  describe('PATCH /orders/:orderId/delivery-person', () => {
    it('returns 401 without an Authorization header', async () => {
      await request(server())
        .patch(`/orders/${randomUUID()}/delivery-person`)
        .send({ deliveryPersonId: randomUUID() })
        .expect(401);
    });

    it('manager assigns a delivery person to a paid order', async () => {
      const { token: managerToken } = await authManager();
      const { userId: dpId } = await createDeliveryPersonAccount(managerToken);
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.paid,
      });

      const response = await request(server())
        .patch(`/orders/${orderId}/delivery-person`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ deliveryPersonId: dpId })
        .expect(200);

      const body = response.body as { deliveryPersonId: string };
      expect(body.deliveryPersonId).toBe(dpId);

      const dbOrder = await testApp.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(dbOrder.deliveryPersonId).toBe(dpId);
    });

    it('manager assigns a delivery person to a processing order', async () => {
      const { token: managerToken } = await authManager();
      const { userId: dpId } = await createDeliveryPersonAccount(managerToken);
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.processing,
      });

      await request(server())
        .patch(`/orders/${orderId}/delivery-person`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ deliveryPersonId: dpId })
        .expect(200);
    });

    it('re-assigning the same delivery person is idempotent', async () => {
      const { token: managerToken } = await authManager();
      const { userId: dpId } = await createDeliveryPersonAccount(managerToken);
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.paid,
        deliveryPersonId: dpId,
      });

      const response = await request(server())
        .patch(`/orders/${orderId}/delivery-person`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ deliveryPersonId: dpId })
        .expect(200);

      const body = response.body as { deliveryPersonId: string };
      expect(body.deliveryPersonId).toBe(dpId);
    });

    it('re-assigning to a different delivery person replaces the previous assignment', async () => {
      const { token: managerToken } = await authManager();
      const { userId: firstDpId } =
        await createDeliveryPersonAccount(managerToken);
      const { userId: secondDpId } =
        await createDeliveryPersonAccount(managerToken);
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.paid,
        deliveryPersonId: firstDpId,
      });

      const response = await request(server())
        .patch(`/orders/${orderId}/delivery-person`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ deliveryPersonId: secondDpId })
        .expect(200);

      const body = response.body as { deliveryPersonId: string };
      expect(body.deliveryPersonId).toBe(secondDpId);

      const dbOrder = await testApp.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(dbOrder.deliveryPersonId).toBe(secondDpId);
    });

    it('returns 422 when assigning an order that is not paid/processing', async () => {
      const { token: managerToken } = await authManager();
      const { userId: dpId } = await createDeliveryPersonAccount(managerToken);
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.pending,
      });

      await request(server())
        .patch(`/orders/${orderId}/delivery-person`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ deliveryPersonId: dpId })
        .expect(422);
    });

    it('returns 422 when assigning an already shipped order', async () => {
      const { token: managerToken } = await authManager();
      const { userId: dpId } = await createDeliveryPersonAccount(managerToken);
      const { userId: otherDpId } =
        await createDeliveryPersonAccount(managerToken);
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.shipped,
        deliveryPersonId: otherDpId,
      });

      await request(server())
        .patch(`/orders/${orderId}/delivery-person`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ deliveryPersonId: dpId })
        .expect(422);
    });

    it('rejects an id that does not belong to a deliveryPerson', async () => {
      const { token: managerToken } = await authManager();
      const { userId: clientId } = await authClient();
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.paid,
      });

      const response = await request(server())
        .patch(`/orders/${orderId}/delivery-person`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ deliveryPersonId: clientId });

      expect([404, 422]).toContain(response.status);
    });

    it('rejects an id that does not exist', async () => {
      const { token: managerToken } = await authManager();
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.paid,
      });

      const response = await request(server())
        .patch(`/orders/${orderId}/delivery-person`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ deliveryPersonId: randomUUID() });

      expect([404, 422]).toContain(response.status);
    });

    it('returns 403 when a client attempts this endpoint', async () => {
      const { token: managerToken } = await authManager();
      const { userId: dpId } = await createDeliveryPersonAccount(managerToken);
      const { token, userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.paid,
      });

      await request(server())
        .patch(`/orders/${orderId}/delivery-person`)
        .set('Authorization', `Bearer ${token}`)
        .send({ deliveryPersonId: dpId })
        .expect(403);
    });

    it('returns 403 when a delivery person attempts this endpoint', async () => {
      const { token: managerToken } = await authManager();
      const { userId: dpId } = await createDeliveryPersonAccount(managerToken);
      const { token: dpToken } = await authDeliveryPerson();
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.paid,
      });

      await request(server())
        .patch(`/orders/${orderId}/delivery-person`)
        .set('Authorization', `Bearer ${dpToken}`)
        .send({ deliveryPersonId: dpId })
        .expect(403);
    });

    it('returns 404 for an unknown orderId', async () => {
      const { token: managerToken } = await authManager();
      const { userId: dpId } = await createDeliveryPersonAccount(managerToken);

      await request(server())
        .patch(`/orders/${randomUUID()}/delivery-person`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ deliveryPersonId: dpId })
        .expect(404);
    });
  });

  describe('PATCH /orders/:orderId/status for delivery flow', () => {
    it('manager cannot set delivered directly', async () => {
      const { token: managerToken } = await authManager();
      const { userId: dpId } = await createDeliveryPersonAccount(managerToken);
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.shipped,
        deliveryPersonId: dpId,
      });

      await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'delivered' })
        .expect(403);
    });

    it('manager can still set processing and shipped', async () => {
      const { token: managerToken } = await authManager();
      const { userId: dpId } = await createDeliveryPersonAccount(managerToken);
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.paid,
        deliveryPersonId: dpId,
      });

      await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'processing' })
        .expect(200);

      await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'shipped' })
        .expect(200);
    });

    it('returns 422 advancing processing to shipped with no delivery person assigned', async () => {
      const { token: managerToken } = await authManager();
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.processing,
      });

      await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'shipped' })
        .expect(422);
    });

    it('assigned delivery person advances shipped to delivered', async () => {
      const { token: managerToken } = await authManager();
      const { userId: dpId, token: dpToken } =
        await createDeliveryPersonAccount(managerToken);
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.shipped,
        deliveryPersonId: dpId,
      });

      const response = await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${dpToken}`)
        .send({ status: 'delivered' })
        .expect(200);

      const body = response.body as { status: string };
      expect(body.status).toBe(OrderStatus.delivered);

      const dbOrder = await testApp.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(dbOrder.status).toBe(OrderStatus.delivered);
    });

    it('returns 403 when a delivery person advances an order not assigned to them', async () => {
      const { token: managerToken } = await authManager();
      const { token: dpToken } =
        await createDeliveryPersonAccount(managerToken);
      const { userId: otherDpId } =
        await createDeliveryPersonAccount(managerToken);
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.shipped,
        deliveryPersonId: otherDpId,
      });

      await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${dpToken}`)
        .send({ status: 'delivered' })
        .expect(403);
    });

    it('returns 403 when the assigned delivery person attempts a transition other than shipped to delivered', async () => {
      const { token: managerToken } = await authManager();
      const { userId: dpId, token: dpToken } =
        await createDeliveryPersonAccount(managerToken);
      const { userId } = await authClient();
      const orderId = await createOrderForUser(userId, {
        status: OrderStatus.paid,
        deliveryPersonId: dpId,
      });

      await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${dpToken}`)
        .send({ status: 'processing' })
        .expect(403);
    });
  });

  describe('GET /orders scoped to a delivery person', () => {
    it('delivery person sees only orders assigned to them', async () => {
      const { token: managerToken } = await authManager();
      const { userId: dpId, token: dpToken } =
        await createDeliveryPersonAccount(managerToken);
      const { userId: otherDpId } =
        await createDeliveryPersonAccount(managerToken);
      const { userId: clientId } = await authClient();

      const assignedOrderId = await createOrderForUser(clientId, {
        status: OrderStatus.shipped,
        deliveryPersonId: dpId,
      });
      await createOrderForUser(clientId, {
        status: OrderStatus.shipped,
        deliveryPersonId: otherDpId,
      });
      await createOrderForUser(clientId, {
        status: OrderStatus.paid,
        deliveryPersonId: null,
      });

      const response = await request(server())
        .get('/orders')
        .set('Authorization', `Bearer ${dpToken}`)
        .expect(200);

      const body = response.body as { data: { orderId: string }[] };
      expect(body.data).toHaveLength(1);
      expect(body.data[0].orderId).toBe(assignedOrderId);
    });

    it('ignores the deliveryPersonId and userId filters for a delivery person caller', async () => {
      const { token: managerToken } = await authManager();
      const { userId: dpId, token: dpToken } =
        await createDeliveryPersonAccount(managerToken);
      const { userId: otherDpId } =
        await createDeliveryPersonAccount(managerToken);
      const { userId: clientId } = await authClient();

      const assignedOrderId = await createOrderForUser(clientId, {
        status: OrderStatus.shipped,
        deliveryPersonId: dpId,
      });
      await createOrderForUser(clientId, {
        status: OrderStatus.shipped,
        deliveryPersonId: otherDpId,
      });

      const response = await request(server())
        .get('/orders')
        .query({ deliveryPersonId: otherDpId, userId: clientId })
        .set('Authorization', `Bearer ${dpToken}`)
        .expect(200);

      const body = response.body as { data: { orderId: string }[] };
      expect(body.data).toHaveLength(1);
      expect(body.data[0].orderId).toBe(assignedOrderId);
    });

    it('manager narrows results with ?deliveryPersonId=', async () => {
      const { token: managerToken } = await authManager();
      const { userId: dpId } = await createDeliveryPersonAccount(managerToken);
      const { userId: otherDpId } =
        await createDeliveryPersonAccount(managerToken);
      const { userId: clientId } = await authClient();

      const assignedOrderId = await createOrderForUser(clientId, {
        status: OrderStatus.shipped,
        deliveryPersonId: dpId,
      });
      await createOrderForUser(clientId, {
        status: OrderStatus.shipped,
        deliveryPersonId: otherDpId,
      });

      const response = await request(server())
        .get('/orders')
        .query({ deliveryPersonId: dpId })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      const body = response.body as { data: { orderId: string }[] };
      expect(body.data).toHaveLength(1);
      expect(body.data[0].orderId).toBe(assignedOrderId);
    });
  });

  describe('GET /orders/:orderId scoped to a delivery person', () => {
    it('returns 403 when a delivery person reads an order assigned to someone else', async () => {
      const { token: managerToken } = await authManager();
      const { token: dpToken } =
        await createDeliveryPersonAccount(managerToken);
      const { userId: otherDpId } =
        await createDeliveryPersonAccount(managerToken);
      const { userId: clientId } = await authClient();
      const orderId = await createOrderForUser(clientId, {
        status: OrderStatus.shipped,
        deliveryPersonId: otherDpId,
      });

      await request(server())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${dpToken}`)
        .expect(403);
    });

    it('returns 403 when a delivery person reads an unassigned order', async () => {
      const { token: managerToken } = await authManager();
      const { token: dpToken } =
        await createDeliveryPersonAccount(managerToken);
      const { userId: clientId } = await authClient();
      const orderId = await createOrderForUser(clientId, {
        status: OrderStatus.paid,
        deliveryPersonId: null,
      });

      await request(server())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${dpToken}`)
        .expect(403);
    });

    it('delivery person reads their own assigned order', async () => {
      const { token: managerToken } = await authManager();
      const { userId: dpId, token: dpToken } =
        await createDeliveryPersonAccount(managerToken);
      const { userId: clientId } = await authClient();
      const orderId = await createOrderForUser(clientId, {
        status: OrderStatus.shipped,
        deliveryPersonId: dpId,
      });

      const response = await request(server())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${dpToken}`)
        .expect(200);

      const body = response.body as {
        orderId: string;
        deliveryPersonId: string;
      };
      expect(body.orderId).toBe(orderId);
      expect(body.deliveryPersonId).toBe(dpId);
    });
  });

  describe('Full delivery-person happy path', () => {
    it('manager creates a delivery person, assigns an order, and the delivery person drives it to delivered', async () => {
      const { token: managerToken } = await authManager();
      const { userId: clientId } = await authClient();
      const { userId: otherClientId } = await authClient();

      const { userId: dpId, token: dpToken } =
        await createDeliveryPersonAccount(managerToken);
      const { userId: otherDpId } =
        await createDeliveryPersonAccount(managerToken);

      const orderId = await createOrderForUser(clientId, {
        status: OrderStatus.paid,
      });
      const unrelatedOrderId = await createOrderForUser(otherClientId, {
        status: OrderStatus.paid,
        deliveryPersonId: otherDpId,
      });
      const unassignedOrderId = await createOrderForUser(clientId, {
        status: OrderStatus.paid,
      });

      const assignResponse = await request(server())
        .patch(`/orders/${orderId}/delivery-person`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ deliveryPersonId: dpId })
        .expect(200);
      expect(
        (assignResponse.body as { deliveryPersonId: string }).deliveryPersonId,
      ).toBe(dpId);

      const listResponse = await request(server())
        .get('/orders')
        .set('Authorization', `Bearer ${dpToken}`)
        .expect(200);
      const listBody = listResponse.body as { data: { orderId: string }[] };
      expect(listBody.data).toHaveLength(1);
      expect(listBody.data[0].orderId).toBe(orderId);
      expect(listBody.data.map((o) => o.orderId)).not.toContain(
        unrelatedOrderId,
      );
      expect(listBody.data.map((o) => o.orderId)).not.toContain(
        unassignedOrderId,
      );

      const detailResponse = await request(server())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${dpToken}`)
        .expect(200);
      expect((detailResponse.body as { orderId: string }).orderId).toBe(
        orderId,
      );

      await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'processing' })
        .expect(200);

      await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'shipped' })
        .expect(200);

      const deliveredResponse = await request(server())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${dpToken}`)
        .send({ status: 'delivered' })
        .expect(200);
      expect((deliveredResponse.body as { status: string }).status).toBe(
        OrderStatus.delivered,
      );

      const finalDetail = await request(server())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${dpToken}`)
        .expect(200);
      expect((finalDetail.body as { status: string }).status).toBe(
        OrderStatus.delivered,
      );
    });
  });
});
