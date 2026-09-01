import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CheckoutService } from './checkout.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { STRIPE_CLIENT } from '../stripe/stripe-client.provider.js';
import {
  CartStatus,
  OrderStatus,
  ProductStatus,
  Size,
  Color,
  Fit,
  Gender,
} from '../generated/prisma/enums.js';
import type { CreatePaymentLinkDto } from './dto/create-payment-link.dto.js';

describe('CheckoutService', () => {
  let service: CheckoutService;
  let prisma: {
    order: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    cartNumber: {
      create: ReturnType<typeof vi.fn>;
    };
    cartProduct: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    productVariant: {
      findFirst: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let configService: { getOrThrow: ReturnType<typeof vi.fn> };
  let stripe: {
    prices: { create: ReturnType<typeof vi.fn> };
    paymentLinks: { create: ReturnType<typeof vi.fn> };
  };

  const userId = 'user-1';
  const otherUserId = 'user-2';
  const skuId = 'sku-1';
  const productId = 'product-1';
  const cartNumber = 'cart-1';
  const orderId = 'order-1';
  const idempotencyKey = '11111111-1111-1111-1111-111111111111';

  const now = new Date('2024-06-01T00:00:00.000Z');
  const futureDate = new Date('2024-06-02T00:00:00.000Z');

  const ttlHours = 24;
  const currency = 'usd';
  const successUrl = 'https://example.com/success';
  const unitPrice = 25.5;

  const dto: CreatePaymentLinkDto = { skuId, quantity: 2 };

  const configValues: Record<string, unknown> = {
    'cart.ttlHours': ttlHours,
    'stripe.currency': currency,
    'stripe.successUrl': successUrl,
  };

  const makeVariantRow = (overrides: Record<string, unknown> = {}) => ({
    id: skuId,
    productId,
    size: Size.m,
    color: Color.black,
    fit: Fit.regular,
    gender: Gender.unisex,
    stock: 10,
    price: unitPrice,
    status: ProductStatus.enabled,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    product: {
      id: productId,
      status: ProductStatus.enabled,
      deletedAt: null,
    },
    ...overrides,
  });

  const makeCartProductRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'cart-product-1',
    cartNumber,
    skuId,
    quantity: dto.quantity,
    unitPrice,
    createdAt: now,
    updatedAt: now,
    variant: makeVariantRow(),
    ...overrides,
  });

  const makeCartRow = (overrides: Record<string, unknown> = {}) => ({
    cartNumber,
    userId,
    status: CartStatus.confirmed,
    expiresAt: futureDate,
    createdAt: now,
    updatedAt: now,
    cartProducts: [makeCartProductRow()],
    ...overrides,
  });

  const makeOrderRow = (overrides: Record<string, unknown> = {}) => ({
    id: orderId,
    cartNumber,
    idempotencyKey,
    paymentLink: null,
    paymentIntent: null,
    status: OrderStatus.pending,
    createdAt: now,
    updatedAt: now,
    cart: makeCartRow(),
    ...overrides,
  });

  const setupService = async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CheckoutService,
        PrismaService,
        ConfigService,
        { provide: STRIPE_CLIENT, useValue: stripe },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(ConfigService)
      .useValue(configService)
      .compile();

    return moduleRef.get(CheckoutService);
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    prisma = {
      order: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
      },
      cartNumber: {
        create: vi.fn(),
      },
      cartProduct: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
      productVariant: {
        findFirst: vi.fn().mockResolvedValue(makeVariantRow()),
        findUnique: vi.fn().mockResolvedValue(makeVariantRow()),
        findUniqueOrThrow: vi.fn().mockResolvedValue(makeVariantRow()),
      },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) =>
          Promise.resolve(callback(prisma)),
        ),
    };

    configService = {
      getOrThrow: vi.fn().mockImplementation((key: string) => {
        return configValues[key];
      }),
    };

    stripe = {
      prices: {
        create: vi.fn().mockResolvedValue({ id: 'price_123' }),
      },
      paymentLinks: {
        create: vi.fn().mockResolvedValue({
          id: 'plink_123',
          url: 'https://buy.stripe.com/test_123',
        }),
      },
    };

    prisma.cartNumber.create.mockResolvedValue(makeCartRow());
    prisma.cartProduct.create.mockResolvedValue(makeCartProductRow());
    prisma.cartProduct.findMany.mockResolvedValue([makeCartProductRow()]);
    prisma.order.create.mockResolvedValue(makeOrderRow());
    prisma.order.update.mockResolvedValue(
      makeOrderRow({
        paymentLink: 'https://buy.stripe.com/test_123',
        cart: makeCartRow({
          cartProducts: [makeCartProductRow({ unitPrice })],
        }),
      }),
    );

    service = await setupService();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('idempotency replay', () => {
    it('returns the original order and payment link without creating a new order or calling Stripe again', async () => {
      const existingOrder = makeOrderRow({
        paymentLink: 'https://buy.stripe.com/existing',
        cart: makeCartRow({ userId }),
      });
      prisma.order.findUnique.mockResolvedValue(existingOrder);
      prisma.order.findFirst.mockResolvedValue(existingOrder);

      const result = await service.createPaymentLink(
        userId,
        idempotencyKey,
        dto,
      );

      expect(result.paymentLink).toBe('https://buy.stripe.com/existing');
      expect(result.order.orderId).toBe(orderId);
      expect(stripe.prices.create).not.toHaveBeenCalled();
      expect(stripe.paymentLinks.create).not.toHaveBeenCalled();
      expect(prisma.order.create).not.toHaveBeenCalled();
    });
  });

  describe('cross-user idempotency key collision', () => {
    it('throws NotFoundException when the existing order belongs to a different user', async () => {
      const existingOrder = makeOrderRow({
        paymentLink: 'https://buy.stripe.com/existing',
        cart: makeCartRow({ userId: otherUserId }),
      });
      prisma.order.findUnique.mockResolvedValue(existingOrder);
      prisma.order.findFirst.mockResolvedValue(existingOrder);

      await expect(
        service.createPaymentLink(userId, idempotencyKey, dto),
      ).rejects.toThrow(NotFoundException);
      expect(stripe.prices.create).not.toHaveBeenCalled();
      expect(stripe.paymentLinks.create).not.toHaveBeenCalled();
      expect(prisma.order.create).not.toHaveBeenCalled();
    });
  });

  describe('sellability check', () => {
    it.each([
      ['the SKU does not exist', null, null],
      [
        'the variant is disabled',
        null,
        makeVariantRow({ status: ProductStatus.disabled }),
      ],
      ['the variant is soft-deleted', null, makeVariantRow({ deletedAt: now })],
      [
        'the parent product is disabled',
        null,
        makeVariantRow({
          product: {
            id: productId,
            status: ProductStatus.disabled,
            deletedAt: null,
          },
        }),
      ],
      [
        'the parent product is soft-deleted',
        null,
        makeVariantRow({
          product: {
            id: productId,
            status: ProductStatus.enabled,
            deletedAt: now,
          },
        }),
      ],
    ])(
      'throws NotFoundException when %s',
      async (_label, findFirstValue, findUniqueValue) => {
        prisma.productVariant.findFirst.mockResolvedValue(findFirstValue);
        prisma.productVariant.findUnique.mockResolvedValue(findUniqueValue);

        await expect(
          service.createPaymentLink(userId, idempotencyKey, dto),
        ).rejects.toThrow(NotFoundException);
        expect(stripe.prices.create).not.toHaveBeenCalled();
        expect(stripe.paymentLinks.create).not.toHaveBeenCalled();
        expect(prisma.order.create).not.toHaveBeenCalled();
      },
    );
  });

  describe('stock check', () => {
    it('throws ConflictException when the requested quantity exceeds stock and never calls Stripe', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(
        makeVariantRow({ stock: 1 }),
      );
      prisma.productVariant.findUnique.mockResolvedValue(
        makeVariantRow({ stock: 1 }),
      );

      await expect(
        service.createPaymentLink(userId, idempotencyKey, {
          skuId,
          quantity: 2,
        }),
      ).rejects.toThrow(ConflictException);
      expect(stripe.prices.create).not.toHaveBeenCalled();
      expect(stripe.paymentLinks.create).not.toHaveBeenCalled();
      expect(prisma.order.create).not.toHaveBeenCalled();
    });
  });

  describe('happy path — new order', () => {
    it('creates an invisible confirmed cart with a single line for the requested SKU/quantity at the current price', async () => {
      await service.createPaymentLink(userId, idempotencyKey, dto);

      expect(prisma.cartNumber.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            status: CartStatus.confirmed,
          }) as unknown,
        }),
      );

      const cartCreateArgs = prisma.cartNumber.create.mock.calls[0][0] as {
        data: { expiresAt: Date };
      };
      const expectedExpiry = new Date(
        now.getTime() + ttlHours * 60 * 60 * 1000,
      );
      expect(cartCreateArgs.data.expiresAt.getTime()).toBe(
        expectedExpiry.getTime(),
      );
      expect(configService.getOrThrow).toHaveBeenCalledWith('cart.ttlHours');

      expect(prisma.cartProduct.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            skuId,
            quantity: dto.quantity,
          }) as unknown,
        }),
      );
    });

    it('never reuses an active-cart status for the invisible cart', async () => {
      await service.createPaymentLink(userId, idempotencyKey, dto);

      const cartCreateArgs = prisma.cartNumber.create.mock.calls[0][0] as {
        data: { status: CartStatus };
      };
      expect(cartCreateArgs.data.status).not.toBe(CartStatus.active);
    });

    it('creates the order in pending status linked to the cart with the given idempotency key', async () => {
      await service.createPaymentLink(userId, idempotencyKey, dto);

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cartNumber,
            idempotencyKey,
          }) as unknown,
        }),
      );
      const orderCreateArgs = prisma.order.create.mock.calls[0][0] as {
        data: { status?: OrderStatus };
      };
      expect(
        orderCreateArgs.data.status === undefined ||
          orderCreateArgs.data.status === OrderStatus.pending,
      ).toBe(true);
    });

    it('creates a Stripe Price from the variant price and configured currency', async () => {
      await service.createPaymentLink(userId, idempotencyKey, dto);

      expect(stripe.prices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          currency,
          unit_amount: Math.round(unitPrice * 100),
        }),
      );
      expect(configService.getOrThrow).toHaveBeenCalledWith('stripe.currency');
    });

    it('creates a Stripe Payment Link with the orderId metadata and success redirect', async () => {
      await service.createPaymentLink(userId, idempotencyKey, dto);

      const paymentLinkArgs = stripe.paymentLinks.create.mock.calls[0][0] as {
        line_items: Array<{ price: string; quantity: number }>;
        metadata?: Record<string, unknown>;
        after_completion?: {
          type: string;
          redirect: { url: string };
        };
      };

      expect(paymentLinkArgs.line_items).toEqual([
        expect.objectContaining({ price: 'price_123', quantity: dto.quantity }),
      ]);
      expect(paymentLinkArgs.metadata).toEqual(
        expect.objectContaining({ orderId }),
      );
      expect(paymentLinkArgs.after_completion).toEqual(
        expect.objectContaining({
          type: 'redirect',
          redirect: expect.objectContaining({ url: successUrl }) as unknown,
        }),
      );
      expect(configService.getOrThrow).toHaveBeenCalledWith(
        'stripe.successUrl',
      );
    });

    it('persists the resulting Payment Link URL onto the order', async () => {
      await service.createPaymentLink(userId, idempotencyKey, dto);

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: orderId }) as unknown,
          data: expect.objectContaining({
            paymentLink: 'https://buy.stripe.com/test_123',
          }) as unknown,
        }),
      );
    });

    it('returns totalAmount as unitPrice times quantity, paymentMethod payment_link, and status pending', async () => {
      const result = await service.createPaymentLink(
        userId,
        idempotencyKey,
        dto,
      );

      expect(result.order.totalAmount).toBe(unitPrice * dto.quantity);
      expect(result.order.paymentMethod).toBe('payment_link');
      expect(result.order.status).toBe(OrderStatus.pending);
    });
  });

  describe('response shape', () => {
    it('maps the order id to orderId and returns the PaymentLinkEntity shape', async () => {
      const result = await service.createPaymentLink(
        userId,
        idempotencyKey,
        dto,
      );

      expect(result).toEqual(
        expect.objectContaining({
          order: expect.objectContaining({
            orderId,
            cartNumber: expect.any(String) as unknown,
            userId,
            status: expect.any(String) as unknown,
            paymentMethod: 'payment_link',
            totalAmount: expect.any(Number) as unknown,
            createdAt: expect.any(Date) as unknown,
            updatedAt: expect.any(Date) as unknown,
          }) as unknown,
          paymentLink: expect.any(String) as unknown,
        }),
      );
    });
  });
});
