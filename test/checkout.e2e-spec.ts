import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import Stripe from 'stripe';
import { STRIPE_CLIENT } from '../src/stripe/stripe-client.provider.js';
import { Role } from '../src/generated/prisma/enums.js';
import {
  closeTestApp,
  createTestApp,
  resetDatabase,
  seedUser,
  signAccessToken,
  type TestApp,
} from './e2e/test-app.js';

describe('Checkout (e2e)', () => {
  let testApp: TestApp;
  let stripe: Stripe;

  beforeAll(async () => {
    testApp = await createTestApp();
    stripe = testApp.app.get(STRIPE_CLIENT);
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

  function mockStripeSuccess(): void {
    vi.spyOn(stripe.prices, 'create').mockResolvedValue({
      id: 'price_test123',
    } as unknown as Stripe.Response<Stripe.Price>);
    vi.spyOn(stripe.paymentLinks, 'create').mockResolvedValue({
      id: 'plink_test123',
      url: 'https://checkout.stripe.com/pay/test123',
    } as unknown as Stripe.Response<Stripe.PaymentLink>);
  }

  function mockStripePaymentIntentSuccess(clientSecret = 'pi_test_secret_123') {
    const create = vi.spyOn(stripe.paymentIntents, 'create').mockResolvedValue({
      id: 'pi_test123',
      client_secret: clientSecret,
    } as unknown as Stripe.Response<Stripe.PaymentIntent>);
    const retrieve = vi
      .spyOn(stripe.paymentIntents, 'retrieve')
      .mockResolvedValue({
        id: 'pi_test123',
        client_secret: clientSecret,
      } as unknown as Stripe.Response<Stripe.PaymentIntent>);

    return { create, retrieve };
  }

  async function addCartItem(
    token: string,
    skuId: string,
    quantity: number,
  ): Promise<void> {
    await request(server())
      .post('/me/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ skuId, quantity })
      .expect(201);
  }

  function buildWebhookPayload(orderId: string, type: string): string {
    return JSON.stringify({
      id: 'evt_test_1',
      type,
      data: { object: { id: 'pi_test123', metadata: { orderId } } },
    });
  }

  function signWebhookPayload(
    payload: string,
    secret = process.env.STRIPE_WEBHOOK_SECRET ?? '',
  ): string {
    return stripe.webhooks.generateTestHeaderString({ payload, secret });
  }

  function deliverWebhook(payload: string, signature: string): request.Test {
    return request(server())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(payload);
  }

  async function createSellableVariant(
    overrides: {
      stock?: number;
      price?: number;
      productStatus?: 'enabled' | 'disabled';
      productDeletedAt?: Date | null;
      variantStatus?: 'enabled' | 'disabled';
      variantDeletedAt?: Date | null;
    } = {},
  ): Promise<{ productId: string; skuId: string }> {
    const product = await testApp.prisma.product.create({
      data: {
        name: 'Test T-Shirt',
        status: overrides.productStatus ?? 'enabled',
        deletedAt: overrides.productDeletedAt ?? null,
      },
    });

    const variant = await testApp.prisma.productVariant.create({
      data: {
        productId: product.id,
        size: 'm',
        color: 'black',
        fit: 'regular',
        gender: 'unisex',
        stock: overrides.stock ?? 10,
        price: overrides.price ?? 25.5,
        status: overrides.variantStatus ?? 'enabled',
        deletedAt: overrides.variantDeletedAt ?? null,
      },
    });

    return { productId: product.id, skuId: variant.id };
  }

  async function authClient(): Promise<{ token: string; userId: string }> {
    const user = await seedUser(testApp.prisma, { role: Role.client });
    return { token: signAccessToken(testApp.app, user), userId: user.id };
  }

  describe('POST /checkout/payment-link', () => {
    it('creates a pending order with a payment link for a sellable SKU', async () => {
      mockStripeSuccess();
      const { token, userId } = await authClient();
      const { skuId } = await createSellableVariant({ stock: 5, price: 30 });
      const idempotencyKey = randomUUID();

      const response = await request(server())
        .post('/checkout/payment-link')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ skuId, quantity: 2 })
        .expect(201);

      const body = response.body as {
        order: {
          orderId: string;
          cartNumber: string;
          userId: string;
          status: string;
          paymentMethod: string;
          totalAmount: number;
          createdAt: string;
          updatedAt: string;
        };
        paymentLink: string;
      };

      expect(body.order.status).toBe('pending');
      expect(body.order.paymentMethod).toBe('payment_link');
      expect(body.order.userId).toBe(userId);
      expect(body.order.orderId).toEqual(expect.any(String));
      expect(body.order.cartNumber).toEqual(expect.any(String));
      expect(body.paymentLink).toBe('https://checkout.stripe.com/pay/test123');

      const dbOrder = await testApp.prisma.order.findUniqueOrThrow({
        where: { id: body.order.orderId },
      });
      expect(dbOrder.status).toBe('pending');
      expect(dbOrder.idempotencyKey).toBe(idempotencyKey);
      expect(dbOrder.paymentLink).toBe(
        'https://checkout.stripe.com/pay/test123',
      );
    });

    it('returns the same order on a retried Idempotency-Key instead of creating a second one', async () => {
      mockStripeSuccess();
      const { token } = await authClient();
      const { skuId } = await createSellableVariant({ stock: 5 });
      const idempotencyKey = randomUUID();

      const firstResponse = await request(server())
        .post('/checkout/payment-link')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ skuId, quantity: 1 })
        .expect(201);

      const secondResponse = await request(server())
        .post('/checkout/payment-link')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ skuId, quantity: 1 })
        .expect(201);

      const firstOrder = (firstResponse.body as { order: { orderId: string } })
        .order;
      const secondOrder = (
        secondResponse.body as { order: { orderId: string } }
      ).order;
      expect(secondOrder.orderId).toBe(firstOrder.orderId);

      const orders = await testApp.prisma.order.findMany({
        where: { idempotencyKey },
      });
      expect(orders).toHaveLength(1);
    });

    it('returns 404 when the skuId does not exist', async () => {
      mockStripeSuccess();
      const { token } = await authClient();

      await request(server())
        .post('/checkout/payment-link')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ skuId: randomUUID(), quantity: 1 })
        .expect(404);
    });

    it('returns 404 when the variant is disabled', async () => {
      mockStripeSuccess();
      const { token } = await authClient();
      const { skuId } = await createSellableVariant({
        variantStatus: 'disabled',
      });

      await request(server())
        .post('/checkout/payment-link')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ skuId, quantity: 1 })
        .expect(404);
    });

    it('returns 404 when the variant is soft-deleted', async () => {
      mockStripeSuccess();
      const { token } = await authClient();
      const { skuId } = await createSellableVariant({
        variantDeletedAt: new Date(),
      });

      await request(server())
        .post('/checkout/payment-link')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ skuId, quantity: 1 })
        .expect(404);
    });

    it('returns 404 when the parent product is disabled', async () => {
      mockStripeSuccess();
      const { token } = await authClient();
      const { skuId } = await createSellableVariant({
        productStatus: 'disabled',
      });

      await request(server())
        .post('/checkout/payment-link')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ skuId, quantity: 1 })
        .expect(404);
    });

    it('returns 404 when the parent product is soft-deleted', async () => {
      mockStripeSuccess();
      const { token } = await authClient();
      const { skuId } = await createSellableVariant({
        productDeletedAt: new Date(),
      });

      await request(server())
        .post('/checkout/payment-link')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ skuId, quantity: 1 })
        .expect(404);
    });

    it('returns 409 when the requested quantity exceeds stock', async () => {
      mockStripeSuccess();
      const { token } = await authClient();
      const { skuId } = await createSellableVariant({ stock: 2 });

      await request(server())
        .post('/checkout/payment-link')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ skuId, quantity: 3 })
        .expect(409);
    });

    it('returns 401 without an Authorization header', async () => {
      mockStripeSuccess();
      const { skuId } = await createSellableVariant();

      await request(server())
        .post('/checkout/payment-link')
        .set('Idempotency-Key', randomUUID())
        .send({ skuId, quantity: 1 })
        .expect(401);
    });

    it('returns 403 for a manager (not a client)', async () => {
      mockStripeSuccess();
      const manager = await seedUser(testApp.prisma, { role: Role.manager });
      const token = signAccessToken(testApp.app, manager);
      const { skuId } = await createSellableVariant();

      await request(server())
        .post('/checkout/payment-link')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ skuId, quantity: 1 })
        .expect(403);
    });

    it('returns 400 when Idempotency-Key header is missing', async () => {
      mockStripeSuccess();
      const { token } = await authClient();
      const { skuId } = await createSellableVariant();

      await request(server())
        .post('/checkout/payment-link')
        .set('Authorization', `Bearer ${token}`)
        .send({ skuId, quantity: 1 })
        .expect(400);
    });

    it('returns 400 when Idempotency-Key header is not a UUID', async () => {
      mockStripeSuccess();
      const { token } = await authClient();
      const { skuId } = await createSellableVariant();

      await request(server())
        .post('/checkout/payment-link')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'not-a-uuid')
        .send({ skuId, quantity: 1 })
        .expect(400);
    });

    it('returns 400 when skuId is missing', async () => {
      mockStripeSuccess();
      const { token } = await authClient();

      await request(server())
        .post('/checkout/payment-link')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ quantity: 1 })
        .expect(400);
    });

    it('returns 400 when quantity is zero', async () => {
      mockStripeSuccess();
      const { token } = await authClient();
      const { skuId } = await createSellableVariant();

      await request(server())
        .post('/checkout/payment-link')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ skuId, quantity: 0 })
        .expect(400);
    });

    it('returns 400 when quantity is not an integer', async () => {
      mockStripeSuccess();
      const { token } = await authClient();
      const { skuId } = await createSellableVariant();

      await request(server())
        .post('/checkout/payment-link')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ skuId, quantity: 1.5 })
        .expect(400);
    });

    it('returns 400 for an unknown/extra field in the body', async () => {
      mockStripeSuccess();
      const { token } = await authClient();
      const { skuId } = await createSellableVariant();

      await request(server())
        .post('/checkout/payment-link')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ skuId, quantity: 1, discountCode: 'SUMMER10' })
        .expect(400);
    });
  });

  describe('POST /checkout/payment-intent', () => {
    it('creates a pending order from the active cart, then marks it paid via the Stripe webhook', async () => {
      mockStripePaymentIntentSuccess();
      const { token, userId } = await authClient();
      const { skuId } = await createSellableVariant({ stock: 5, price: 30 });
      await addCartItem(token, skuId, 2);
      const idempotencyKey = randomUUID();

      const response = await request(server())
        .post('/checkout/payment-intent')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .expect(201);

      const body = response.body as {
        order: {
          orderId: string;
          cartNumber: string;
          userId: string;
          status: string;
          paymentMethod: string;
          totalAmount: number;
        };
        clientSecret: string;
      };

      expect(body.order.status).toBe('pending');
      expect(body.order.paymentMethod).toBe('payment_intent');
      expect(body.order.userId).toBe(userId);
      expect(body.order.totalAmount).toBe(60);
      expect(body.clientSecret).toBe('pi_test_secret_123');

      const pendingOrder = await testApp.prisma.order.findUniqueOrThrow({
        where: { id: body.order.orderId },
      });
      expect(pendingOrder.status).toBe('pending');
      expect(pendingOrder.idempotencyKey).toBe(idempotencyKey);
      expect(pendingOrder.paymentIntent).toBe('pi_test123');

      const payload = buildWebhookPayload(
        body.order.orderId,
        'payment_intent.succeeded',
      );
      await deliverWebhook(payload, signWebhookPayload(payload)).expect(200);

      const paidOrder = await testApp.prisma.order.findUniqueOrThrow({
        where: { id: body.order.orderId },
      });
      expect(paidOrder.status).toBe('paid');

      const variant = await testApp.prisma.productVariant.findUniqueOrThrow({
        where: { id: skuId },
      });
      expect(variant.stock).toBe(3);
    });

    it('returns the same order on a retried Idempotency-Key instead of creating a second one', async () => {
      const { create } = mockStripePaymentIntentSuccess();
      const { token } = await authClient();
      const { skuId } = await createSellableVariant({ stock: 5 });
      await addCartItem(token, skuId, 1);
      const idempotencyKey = randomUUID();

      const firstResponse = await request(server())
        .post('/checkout/payment-intent')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .expect(201);

      const secondResponse = await request(server())
        .post('/checkout/payment-intent')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .expect(201);

      const firstOrder = (firstResponse.body as { order: { orderId: string } })
        .order;
      const secondOrder = (
        secondResponse.body as { order: { orderId: string } }
      ).order;
      expect(secondOrder.orderId).toBe(firstOrder.orderId);

      const orders = await testApp.prisma.order.findMany({
        where: { idempotencyKey },
      });
      expect(orders).toHaveLength(1);
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('returns 422 when the active cart is empty', async () => {
      mockStripePaymentIntentSuccess();
      const { token } = await authClient();

      await request(server())
        .post('/checkout/payment-intent')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .expect(422);
    });

    it('returns 409 when a cart item now exceeds current stock', async () => {
      mockStripePaymentIntentSuccess();
      const { token } = await authClient();
      const { skuId } = await createSellableVariant({ stock: 5 });
      await addCartItem(token, skuId, 3);

      await testApp.prisma.productVariant.update({
        where: { id: skuId },
        data: { stock: 1 },
      });

      await request(server())
        .post('/checkout/payment-intent')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .expect(409);
    });

    it('returns 401 without an Authorization header', async () => {
      mockStripePaymentIntentSuccess();

      await request(server())
        .post('/checkout/payment-intent')
        .set('Idempotency-Key', randomUUID())
        .expect(401);
    });

    it('returns 403 for a manager (not a client)', async () => {
      mockStripePaymentIntentSuccess();
      const manager = await seedUser(testApp.prisma, { role: Role.manager });
      const token = signAccessToken(testApp.app, manager);

      await request(server())
        .post('/checkout/payment-intent')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .expect(403);
    });

    it('returns 400 when Idempotency-Key header is missing', async () => {
      mockStripePaymentIntentSuccess();
      const { token } = await authClient();

      await request(server())
        .post('/checkout/payment-intent')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('returns 400 when Idempotency-Key header is not a UUID', async () => {
      mockStripePaymentIntentSuccess();
      const { token } = await authClient();

      await request(server())
        .post('/checkout/payment-intent')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'not-a-uuid')
        .expect(400);
    });
  });
});
