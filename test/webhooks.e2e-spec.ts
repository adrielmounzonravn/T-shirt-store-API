import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import Stripe from 'stripe';
import { STRIPE_CLIENT } from '../src/stripe/stripe-client.provider.js';
import {
  closeTestApp,
  createTestApp,
  resetDatabase,
  seedUser,
  signAccessToken,
  type TestApp,
} from './e2e/test-app.js';

describe('Webhooks (e2e)', () => {
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

  function mockStripePaymentIntentSuccess(
    clientSecret = 'pi_test_secret_123',
  ): void {
    vi.spyOn(stripe.paymentIntents, 'create').mockResolvedValue({
      id: 'pi_test123',
      client_secret: clientSecret,
    } as unknown as Stripe.Response<Stripe.PaymentIntent>);
    vi.spyOn(stripe.paymentIntents, 'retrieve').mockResolvedValue({
      id: 'pi_test123',
      client_secret: clientSecret,
    } as unknown as Stripe.Response<Stripe.PaymentIntent>);
  }

  async function createSellableVariant(
    overrides: { stock?: number; price?: number } = {},
  ): Promise<{ productId: string; skuId: string }> {
    const product = await testApp.prisma.product.create({
      data: { name: 'Test T-Shirt', status: 'enabled', deletedAt: null },
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
        status: 'enabled',
        deletedAt: null,
      },
    });

    return { productId: product.id, skuId: variant.id };
  }

  async function authClient(): Promise<{ token: string; userId: string }> {
    const user = await seedUser(testApp.prisma);
    return { token: signAccessToken(testApp.app, user), userId: user.id };
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
      .expect(200);
  }

  async function createPendingPaymentIntentOrder(
    quantity = 2,
    stock = 5,
  ): Promise<{ orderId: string; skuId: string; quantity: number }> {
    mockStripePaymentIntentSuccess();
    const { token } = await authClient();
    const { skuId } = await createSellableVariant({ stock });
    await addCartItem(token, skuId, quantity);

    const response = await request(server())
      .post('/checkout/payment-intent')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .expect(201);

    const orderId = (response.body as { order: { orderId: string } }).order
      .orderId;

    return { orderId, skuId, quantity };
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

  function deliverWebhook(payload: string, signature?: string): request.Test {
    const req = request(server())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json');

    if (signature !== undefined) {
      req.set('stripe-signature', signature);
    }

    return req.send(payload);
  }

  describe('POST /webhooks/stripe', () => {
    it('rejects a request with no Stripe-Signature header and does not mutate the order', async () => {
      const { orderId, skuId } = await createPendingPaymentIntentOrder();
      const payload = buildWebhookPayload(orderId, 'payment_intent.succeeded');

      await deliverWebhook(payload).expect(400);

      const order = await testApp.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(order.status).toBe('pending');

      const variant = await testApp.prisma.productVariant.findUniqueOrThrow({
        where: { id: skuId },
      });
      expect(variant.stock).toBe(5);
    });

    it('rejects a request with a forged Stripe-Signature and does not mutate the order', async () => {
      const { orderId, skuId } = await createPendingPaymentIntentOrder();
      const payload = buildWebhookPayload(orderId, 'payment_intent.succeeded');
      const forgedSignature = signWebhookPayload(
        payload,
        'wrong_webhook_secret',
      );

      await deliverWebhook(payload, forgedSignature).expect(400);

      const order = await testApp.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(order.status).toBe('pending');

      const variant = await testApp.prisma.productVariant.findUniqueOrThrow({
        where: { id: skuId },
      });
      expect(variant.stock).toBe(5);
    });

    it('rejects a request signed with a garbage signature string', async () => {
      const { orderId } = await createPendingPaymentIntentOrder();
      const payload = buildWebhookPayload(orderId, 'payment_intent.succeeded');

      await deliverWebhook(payload, 'not-a-real-signature').expect(400);

      const order = await testApp.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(order.status).toBe('pending');
    });

    it('transitions a pending order to paid and decrements stock on a valid payment_intent.succeeded event', async () => {
      const { orderId, skuId, quantity } =
        await createPendingPaymentIntentOrder(2, 5);
      const payload = buildWebhookPayload(orderId, 'payment_intent.succeeded');

      await deliverWebhook(payload, signWebhookPayload(payload)).expect(200);

      const order = await testApp.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(order.status).toBe('paid');

      const variant = await testApp.prisma.productVariant.findUniqueOrThrow({
        where: { id: skuId },
      });
      expect(variant.stock).toBe(5 - quantity);
    });

    it('is idempotent: replaying payment_intent.succeeded for an already-paid order does not decrement stock again', async () => {
      const { orderId, skuId, quantity } =
        await createPendingPaymentIntentOrder(2, 5);
      const payload = buildWebhookPayload(orderId, 'payment_intent.succeeded');
      const signature = signWebhookPayload(payload);

      await deliverWebhook(payload, signature).expect(200);

      const orderAfterFirstDelivery =
        await testApp.prisma.order.findUniqueOrThrow({
          where: { id: orderId },
        });
      const variantAfterFirstDelivery =
        await testApp.prisma.productVariant.findUniqueOrThrow({
          where: { id: skuId },
        });
      expect(orderAfterFirstDelivery.status).toBe('paid');
      expect(variantAfterFirstDelivery.stock).toBe(5 - quantity);

      await deliverWebhook(payload, signature).expect(200);

      const orderAfterReplay = await testApp.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      const variantAfterReplay =
        await testApp.prisma.productVariant.findUniqueOrThrow({
          where: { id: skuId },
        });
      expect(orderAfterReplay.status).toBe('paid');
      expect(variantAfterReplay.stock).toBe(5 - quantity);
    });

    it('acknowledges an unrelated event type with 200 without mutating any order', async () => {
      const { orderId } = await createPendingPaymentIntentOrder();
      const payload = buildWebhookPayload(orderId, 'charge.refunded');

      await deliverWebhook(payload, signWebhookPayload(payload)).expect(200);

      const order = await testApp.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(order.status).toBe('pending');
    });
  });
});
