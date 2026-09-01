import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { WebhooksService } from './webhooks.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { STRIPE_CLIENT } from '../stripe/stripe-client.provider.js';
import { OrderStatus } from '../generated/prisma/enums.js';
import { StockNotificationService } from '../stock-notification/stock-notification.service.js';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: {
    order: {
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
    };
    cartProduct: {
      findMany: ReturnType<typeof vi.fn>;
    };
    productVariant: {
      update: ReturnType<typeof vi.fn>;
    };
  };
  let configService: { getOrThrow: ReturnType<typeof vi.fn> };
  let stripe: {
    webhooks: { constructEvent: ReturnType<typeof vi.fn> };
  };
  let stockNotificationService: {
    enqueueLowStockNotification: ReturnType<typeof vi.fn>;
  };

  const orderId = 'order-1';
  const webhookSecret = 'whsec_test_123';
  const rawBody = Buffer.from('raw-body');
  const signature = 'sig_test_123';

  const setupService = async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WebhooksService,
        PrismaService,
        ConfigService,
        StockNotificationService,
        { provide: STRIPE_CLIENT, useValue: stripe },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(ConfigService)
      .useValue(configService)
      .overrideProvider(StockNotificationService)
      .useValue(stockNotificationService)
      .compile();

    return moduleRef.get(WebhooksService);
  };

  const makeCheckoutSessionEvent = (
    overrides: Record<string, unknown> = {},
  ) => ({
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123',
        metadata: { orderId },
        ...overrides,
      },
    },
  });

  const makePaymentIntentEvent = (overrides: Record<string, unknown> = {}) => ({
    id: 'evt_2',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_test_123',
        metadata: { orderId },
        ...overrides,
      },
    },
  });

  beforeEach(async () => {
    prisma = {
      order: {
        update: vi
          .fn()
          .mockResolvedValue({ id: orderId, status: OrderStatus.paid }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ cartNumber: 'cart-1' }),
      },
      cartProduct: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      productVariant: {
        update: vi.fn().mockResolvedValue({ stock: 10 }),
      },
    };

    configService = {
      getOrThrow: vi.fn().mockImplementation((key: string) => {
        if (key === 'stripe.webhookSecret') return webhookSecret;
        if (key === 'lowStockThreshold') return 3;
        return undefined;
      }),
    };

    stripe = {
      webhooks: {
        constructEvent: vi.fn().mockReturnValue(makeCheckoutSessionEvent()),
      },
    };

    stockNotificationService = {
      enqueueLowStockNotification: vi.fn().mockResolvedValue(undefined),
    };

    service = await setupService();
  });

  describe('signature verification', () => {
    it('verifies the signature using the configured webhook secret', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makeCheckoutSessionEvent(),
      );

      await service.handleStripeEvent(rawBody, signature);

      expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
        rawBody,
        signature,
        webhookSecret,
      );
      expect(configService.getOrThrow).toHaveBeenCalledWith(
        'stripe.webhookSecret',
      );
    });

    it('throws BadRequestException when the signature cannot be verified', async () => {
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(
        service.handleStripeEvent(rawBody, signature),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('throws only BadRequestException, never the raw underlying error', async () => {
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new TypeError('malformed payload');
      });

      await expect(
        service.handleStripeEvent(rawBody, signature),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('checkout.session.completed', () => {
    it('transitions the pending order named in metadata.orderId to paid', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makeCheckoutSessionEvent(),
      );

      await expect(
        service.handleStripeEvent(rawBody, signature),
      ).resolves.toBeUndefined();

      const updateCalls = [
        ...prisma.order.update.mock.calls,
        ...prisma.order.updateMany.mock.calls,
      ] as Array<
        [{ where: Record<string, unknown>; data: Record<string, unknown> }]
      >;
      expect(updateCalls.length).toBeGreaterThan(0);
      const [args] = updateCalls[0];
      expect(args.where).toEqual(expect.objectContaining({ id: orderId }));
      expect(args.data).toEqual(
        expect.objectContaining({ status: OrderStatus.paid }),
      );
    });

    it('only targets orders that are currently pending', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makeCheckoutSessionEvent(),
      );

      await service.handleStripeEvent(rawBody, signature);

      const updateCalls = [
        ...prisma.order.update.mock.calls,
        ...prisma.order.updateMany.mock.calls,
      ] as Array<[{ where: Record<string, unknown> }]>;
      const [args] = updateCalls[0];
      expect(args.where).toEqual(
        expect.objectContaining({ status: OrderStatus.pending }),
      );
    });
  });

  describe('payment_intent.succeeded', () => {
    it('transitions the pending order named in metadata.orderId to paid', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(makePaymentIntentEvent());

      await expect(
        service.handleStripeEvent(rawBody, signature),
      ).resolves.toBeUndefined();

      const updateCalls = [
        ...prisma.order.update.mock.calls,
        ...prisma.order.updateMany.mock.calls,
      ] as Array<
        [{ where: Record<string, unknown>; data: Record<string, unknown> }]
      >;
      expect(updateCalls.length).toBeGreaterThan(0);
      const [args] = updateCalls[0];
      expect(args.where).toEqual(
        expect.objectContaining({ id: orderId, status: OrderStatus.pending }),
      );
      expect(args.data).toEqual(
        expect.objectContaining({ status: OrderStatus.paid }),
      );
    });
  });

  describe('idempotent replay', () => {
    it('does not throw and does not double-apply when the order is already paid (updateMany matches zero rows)', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makeCheckoutSessionEvent(),
      );
      prisma.order.updateMany.mockResolvedValue({ count: 0 });
      prisma.order.update.mockRejectedValue(
        new Error('Record to update not found'),
      );

      await expect(
        service.handleStripeEvent(rawBody, signature),
      ).resolves.toBeUndefined();
    });

    it('is safe to process the same event twice in a row', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makeCheckoutSessionEvent(),
      );

      await service.handleStripeEvent(rawBody, signature);
      await expect(
        service.handleStripeEvent(rawBody, signature),
      ).resolves.toBeUndefined();
    });
  });

  describe('unknown or irrelevant event types', () => {
    it.each([
      'payment_intent.payment_failed',
      'charge.refunded',
      'some.unknown.event',
    ])('does nothing for event type %s', async (type) => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_x',
        type,
        data: { object: { id: 'obj_1', metadata: { orderId } } },
      });

      await expect(
        service.handleStripeEvent(rawBody, signature),
      ).resolves.toBeUndefined();
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('stock decrement on pending -> paid transition', () => {
    it('looks up the order cartNumber, fetches its line items, and decrements stock for each', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makeCheckoutSessionEvent(),
      );
      prisma.order.findUniqueOrThrow.mockResolvedValue({
        cartNumber: 'cart-42',
      });
      prisma.cartProduct.findMany.mockResolvedValue([
        { skuId: 'sku-1', quantity: 2 },
      ]);

      await service.handleStripeEvent(rawBody, signature);

      expect(prisma.order.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: orderId },
        select: { cartNumber: true },
      });
      expect(prisma.cartProduct.findMany).toHaveBeenCalledWith({
        where: { cartNumber: 'cart-42' },
        select: { skuId: true, quantity: true },
      });
      expect(prisma.productVariant.update).toHaveBeenCalledTimes(1);
      expect(prisma.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'sku-1' },
        data: { stock: { decrement: 2 } },
        select: { stock: true },
      });
    });

    it('decrements stock independently for every line item in the order', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(makePaymentIntentEvent());
      prisma.cartProduct.findMany.mockResolvedValue([
        { skuId: 'sku-1', quantity: 1 },
        { skuId: 'sku-2', quantity: 3 },
        { skuId: 'sku-3', quantity: 5 },
      ]);

      await service.handleStripeEvent(rawBody, signature);

      expect(prisma.productVariant.update).toHaveBeenCalledTimes(3);
      expect(prisma.productVariant.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'sku-1' },
        data: { stock: { decrement: 1 } },
        select: { stock: true },
      });
      expect(prisma.productVariant.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'sku-2' },
        data: { stock: { decrement: 3 } },
        select: { stock: true },
      });
      expect(prisma.productVariant.update).toHaveBeenNthCalledWith(3, {
        where: { id: 'sku-3' },
        data: { stock: { decrement: 5 } },
        select: { stock: true },
      });
    });

    it('reads the configured low-stock threshold when a transition happens', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makeCheckoutSessionEvent(),
      );
      prisma.cartProduct.findMany.mockResolvedValue([
        { skuId: 'sku-1', quantity: 1 },
      ]);

      await service.handleStripeEvent(rawBody, signature);

      expect(configService.getOrThrow).toHaveBeenCalledWith(
        'lowStockThreshold',
      );
    });

    it('resolves without throwing when a decremented variant lands exactly on the low-stock threshold', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makeCheckoutSessionEvent(),
      );
      prisma.cartProduct.findMany.mockResolvedValue([
        { skuId: 'sku-1', quantity: 7 },
      ]);
      prisma.productVariant.update.mockResolvedValue({ stock: 3 });

      await expect(
        service.handleStripeEvent(rawBody, signature),
      ).resolves.toBeUndefined();
    });

    it('enqueues a low-stock notification when a decremented variant lands exactly on the configured threshold', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makeCheckoutSessionEvent(),
      );
      prisma.cartProduct.findMany.mockResolvedValue([
        { skuId: 'sku-1', quantity: 7 },
      ]);
      prisma.productVariant.update.mockResolvedValue({ stock: 3 });

      await service.handleStripeEvent(rawBody, signature);

      expect(
        stockNotificationService.enqueueLowStockNotification,
      ).toHaveBeenCalledWith('sku-1');
    });

    it('does not enqueue a low-stock notification when the resulting stock is above the threshold', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makeCheckoutSessionEvent(),
      );
      prisma.cartProduct.findMany.mockResolvedValue([
        { skuId: 'sku-1', quantity: 1 },
      ]);
      prisma.productVariant.update.mockResolvedValue({ stock: 10 });

      await service.handleStripeEvent(rawBody, signature);

      expect(
        stockNotificationService.enqueueLowStockNotification,
      ).not.toHaveBeenCalled();
    });

    it('does not look up the order, fetch line items, or decrement stock on an idempotent replay', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makeCheckoutSessionEvent(),
      );
      prisma.order.updateMany.mockResolvedValue({ count: 0 });
      prisma.order.update.mockRejectedValue(
        new Error('Record to update not found'),
      );

      await service.handleStripeEvent(rawBody, signature);

      expect(prisma.order.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(prisma.cartProduct.findMany).not.toHaveBeenCalled();
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
    });
  });

  describe('missing metadata.orderId', () => {
    it('does nothing when checkout.session.completed has no orderId in metadata', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makeCheckoutSessionEvent({ metadata: {} }),
      );

      await expect(
        service.handleStripeEvent(rawBody, signature),
      ).resolves.toBeUndefined();
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('does nothing when payment_intent.succeeded has no metadata at all', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makePaymentIntentEvent({ metadata: undefined }),
      );

      await expect(
        service.handleStripeEvent(rawBody, signature),
      ).resolves.toBeUndefined();
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });
  });
});
