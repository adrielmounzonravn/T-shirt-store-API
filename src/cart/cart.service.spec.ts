import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CartService } from './cart.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CartStatus,
  Size,
  Color,
  Fit,
  Gender,
  ProductStatus,
} from '../generated/prisma/enums.js';
import type { AddCartItemDto } from './dto/add-cart-item.dto.js';
import type { UpdateCartItemDto } from './dto/update-cart-item.dto.js';

describe('CartService', () => {
  let service: CartService;
  let prisma: {
    cartNumber: {
      findFirst: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    cartProduct: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    productVariant: {
      findFirst: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
    };
  };
  let configService: { getOrThrow: ReturnType<typeof vi.fn> };

  const userId = 'user-1';
  const otherUserId = 'user-2';
  const cartNumber = 'cart-1';
  const productId = 'product-1';
  const skuId = 'sku-1';
  const ttlHours = 24;

  const now = new Date('2024-06-01T00:00:00.000Z');
  const futureDate = new Date('2024-06-02T00:00:00.000Z');

  const makeVariantRow = (overrides: Record<string, unknown> = {}) => ({
    id: skuId,
    productId,
    size: Size.m,
    color: Color.black,
    fit: Fit.regular,
    gender: Gender.unisex,
    stock: 10,
    price: 25.5,
    status: ProductStatus.enabled,
    deletedAt: null,
    images: [],
    createdAt: now,
    updatedAt: now,
    product: {
      id: productId,
      status: ProductStatus.enabled,
      deletedAt: null,
    },
    ...overrides,
  });

  const makeCartRow = (overrides: Record<string, unknown> = {}) => ({
    cartNumber,
    userId,
    status: CartStatus.active,
    expiresAt: futureDate,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  const makeCartProductRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'cart-product-1',
    cartNumber,
    skuId,
    quantity: 2,
    unitPrice: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  const makeFullCartRow = (
    items: Array<{
      skuId?: string;
      quantity?: number;
      unitPrice?: number | null;
      variant?: Record<string, unknown>;
    }> = [],
  ) => ({
    cartNumber,
    status: CartStatus.active,
    expiresAt: futureDate,
    cartProducts: items.map((item) => ({
      ...makeCartProductRow(),
      skuId: item.skuId ?? skuId,
      quantity: item.quantity ?? 2,
      unitPrice: item.unitPrice ?? null,
      variant: makeVariantRow(item.variant ?? {}),
    })),
  });

  const setupService = async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CartService, PrismaService, ConfigService],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(ConfigService)
      .useValue(configService)
      .compile();

    return moduleRef.get(CartService);
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    prisma = {
      cartNumber: {
        findFirst: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      cartProduct: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      productVariant: {
        findFirst: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
    };

    configService = {
      getOrThrow: vi.fn().mockReturnValue(ttlHours),
    };

    prisma.cartNumber.updateMany.mockResolvedValue({ count: 0 });
    prisma.cartNumber.findFirst.mockResolvedValue(makeCartRow());
    prisma.cartNumber.create.mockResolvedValue(makeCartRow());
    prisma.cartNumber.findUniqueOrThrow.mockResolvedValue(makeFullCartRow([]));
    prisma.productVariant.findFirst.mockResolvedValue(makeVariantRow());
    prisma.productVariant.findUniqueOrThrow.mockResolvedValue(makeVariantRow());
    prisma.cartProduct.findUnique.mockResolvedValue(null);
    prisma.cartProduct.upsert.mockResolvedValue(makeCartProductRow());
    prisma.cartProduct.update.mockResolvedValue(makeCartProductRow());
    prisma.cartProduct.delete.mockResolvedValue(makeCartProductRow());

    service = await setupService();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('getCart', () => {
    it('returns the existing active cart with its items and subtotal', async () => {
      prisma.cartNumber.findUniqueOrThrow.mockResolvedValue(
        makeFullCartRow([{ quantity: 2, variant: { price: 10 } }]),
      );

      const result = await service.getCart(userId);

      expect(result.cartNumber).toBe(cartNumber);
      expect(result.status).toBe(CartStatus.active);
      expect(result.items).toHaveLength(1);
      expect(result.subtotal).toBe(20);
      expect(prisma.cartNumber.create).not.toHaveBeenCalled();
    });

    it('creates a new empty active cart when the user has none', async () => {
      prisma.cartNumber.findFirst.mockResolvedValue(null);
      prisma.cartNumber.create.mockResolvedValue(makeCartRow());
      prisma.cartNumber.findUniqueOrThrow.mockResolvedValue(
        makeFullCartRow([]),
      );

      const result = await service.getCart(userId);

      expect(prisma.cartNumber.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
          }) as unknown,
        }),
      );
      expect(result.items).toEqual([]);
      expect(result.subtotal).toBe(0);
    });

    it('sets expiresAt to now + configured TTL hours when creating a new cart', async () => {
      prisma.cartNumber.findFirst.mockResolvedValue(null);
      prisma.cartNumber.create.mockResolvedValue(makeCartRow());

      await service.getCart(userId);

      expect(configService.getOrThrow).toHaveBeenCalledWith('cart.ttlHours');
      const call = prisma.cartNumber.create.mock.calls[0][0] as {
        data: { expiresAt: Date };
      };
      const expected = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
      expect(call.data.expiresAt.getTime()).toBe(expected.getTime());
    });

    it('expires a stale active cart and creates a fresh one instead of reusing it', async () => {
      prisma.cartNumber.updateMany.mockResolvedValue({ count: 1 });
      prisma.cartNumber.findFirst.mockResolvedValue(null);
      prisma.cartNumber.create.mockResolvedValue(makeCartRow());
      prisma.cartNumber.findUniqueOrThrow.mockResolvedValue(
        makeFullCartRow([]),
      );

      const result = await service.getCart(userId);

      expect(prisma.cartNumber.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId }) as unknown,
          data: expect.objectContaining({
            status: CartStatus.expired,
          }) as unknown,
        }),
      );
      expect(prisma.cartNumber.create).toHaveBeenCalled();
      expect(result.items).toEqual([]);
    });

    it('does not create a new cart when an active, non-expired cart exists', async () => {
      prisma.cartNumber.findFirst.mockResolvedValue(
        makeCartRow({ expiresAt: futureDate }),
      );

      await service.getCart(userId);

      expect(prisma.cartNumber.create).not.toHaveBeenCalled();
    });

    it('scopes the active-cart lookup to the given userId', async () => {
      await service.getCart(userId);

      expect(prisma.cartNumber.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId }) as unknown,
        }),
      );
    });

    it('computes subtotal as the sum of variant price times quantity across multiple items', async () => {
      prisma.cartNumber.findUniqueOrThrow.mockResolvedValue(
        makeFullCartRow([
          { skuId: 'sku-1', quantity: 2, variant: { id: 'sku-1', price: 10 } },
          { skuId: 'sku-2', quantity: 3, variant: { id: 'sku-2', price: 5 } },
        ]),
      );

      const result = await service.getCart(userId);

      expect(result.subtotal).toBe(2 * 10 + 3 * 5);
    });

    it('sets unitPrice to null for items in an active cart', async () => {
      prisma.cartNumber.findUniqueOrThrow.mockResolvedValue(
        makeFullCartRow([{ quantity: 1, unitPrice: null }]),
      );

      const result = await service.getCart(userId);

      expect(result.items[0].unitPrice).toBeNull();
    });
  });

  describe('addItem', () => {
    const dto: AddCartItemDto = { skuId, quantity: 3 };

    it('creates a new line when the SKU is not yet in the cart', async () => {
      prisma.cartProduct.findUnique.mockResolvedValue(null);
      prisma.cartNumber.findUniqueOrThrow.mockResolvedValue(
        makeFullCartRow([{ quantity: 3 }]),
      );

      const result = await service.addItem(userId, dto);

      expect(prisma.cartProduct.upsert).toHaveBeenCalled();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe(3);
    });

    it('increments the quantity when the SKU is already a line in the cart', async () => {
      prisma.cartProduct.findUnique.mockResolvedValue(
        makeCartProductRow({ quantity: 2 }),
      );
      prisma.cartNumber.findUniqueOrThrow.mockResolvedValue(
        makeFullCartRow([{ quantity: 5 }]),
      );

      await service.addItem(userId, { skuId, quantity: 3 });

      const upsertCall = prisma.cartProduct.upsert.mock
        .calls[0][0] as unknown as {
        update: { quantity: number };
      };
      expect(upsertCall.update.quantity).toBe(5);
    });

    it('throws NotFoundException when the SKU does not exist or is not sellable', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);

      await expect(service.addItem(userId, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.cartProduct.upsert).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the requested quantity exceeds stock', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(
        makeVariantRow({ stock: 2 }),
      );
      prisma.cartProduct.findUnique.mockResolvedValue(null);

      await expect(
        service.addItem(userId, { skuId, quantity: 5 }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.cartProduct.upsert).not.toHaveBeenCalled();
    });

    it('throws ConflictException when incrementing an existing line would exceed stock', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(
        makeVariantRow({ stock: 5 }),
      );
      prisma.cartProduct.findUnique.mockResolvedValue(
        makeCartProductRow({ quantity: 4 }),
      );

      await expect(
        service.addItem(userId, { skuId, quantity: 3 }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.cartProduct.upsert).not.toHaveBeenCalled();
    });

    it('creates the active cart first if the user has none, before adding the item', async () => {
      prisma.cartNumber.findFirst.mockResolvedValue(null);
      prisma.cartNumber.create.mockResolvedValue(makeCartRow());
      prisma.cartNumber.findUniqueOrThrow.mockResolvedValue(
        makeFullCartRow([{ quantity: 3 }]),
      );

      await service.addItem(userId, dto);

      expect(prisma.cartNumber.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId }) as unknown,
        }),
      );
    });

    it('does not modify another user cart', async () => {
      await service.addItem(userId, dto);

      const findFirstCall = prisma.cartNumber.findFirst.mock.calls[0][0] as {
        where?: { userId?: string };
      };
      expect(findFirstCall.where?.userId).toBe(userId);
      expect(findFirstCall.where?.userId).not.toBe(otherUserId);
    });
  });

  describe('updateItem', () => {
    const dto: UpdateCartItemDto = { quantity: 4 };

    it('overwrites the quantity of an existing line', async () => {
      prisma.cartProduct.findUnique.mockResolvedValue(
        makeCartProductRow({ quantity: 2 }),
      );
      prisma.cartNumber.findUniqueOrThrow.mockResolvedValue(
        makeFullCartRow([{ quantity: 4 }]),
      );

      const result = await service.updateItem(userId, skuId, dto);

      const updateCall = prisma.cartProduct.update.mock.calls[0][0] as {
        data: { quantity: number };
      };
      expect(updateCall.data.quantity).toBe(4);
      expect(result.items[0].quantity).toBe(4);
    });

    it('throws NotFoundException when the SKU is not a line in the active cart', async () => {
      prisma.cartProduct.findUnique.mockResolvedValue(null);

      await expect(service.updateItem(userId, skuId, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.cartProduct.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the new quantity exceeds current stock', async () => {
      prisma.cartProduct.findUnique.mockResolvedValue(
        makeCartProductRow({ quantity: 2 }),
      );
      prisma.productVariant.findUniqueOrThrow.mockResolvedValue(
        makeVariantRow({ stock: 3 }),
      );

      await expect(
        service.updateItem(userId, skuId, { quantity: 10 }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.cartProduct.update).not.toHaveBeenCalled();
    });

    it('scopes the line lookup to the correct cartNumber, not globally by skuId', async () => {
      prisma.cartProduct.findUnique.mockResolvedValue(makeCartProductRow());

      await service.updateItem(userId, skuId, dto);

      const call = JSON.stringify(prisma.cartProduct.findUnique.mock.calls[0]);
      expect(call).toContain(cartNumber);
      expect(call).toContain(skuId);
    });
  });

  describe('removeItem', () => {
    it('deletes the line and returns the updated cart without it', async () => {
      prisma.cartProduct.findUnique.mockResolvedValue(makeCartProductRow());
      prisma.cartNumber.findUniqueOrThrow.mockResolvedValue(
        makeFullCartRow([]),
      );

      const result = await service.removeItem(userId, skuId);

      expect(prisma.cartProduct.delete).toHaveBeenCalled();
      expect(result.items).toEqual([]);
    });

    it('throws NotFoundException when the SKU is not a line in the active cart', async () => {
      prisma.cartProduct.findUnique.mockResolvedValue(null);

      await expect(service.removeItem(userId, skuId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.cartProduct.delete).not.toHaveBeenCalled();
    });

    it('scopes the delete to the correct cartNumber, not globally by skuId', async () => {
      prisma.cartProduct.findUnique.mockResolvedValue(makeCartProductRow());

      await service.removeItem(userId, skuId);

      const call = JSON.stringify(prisma.cartProduct.delete.mock.calls[0]);
      expect(call).toContain(cartNumber);
      expect(call).toContain(skuId);
    });

    it('creates the active cart first if the user has none, before attempting removal', async () => {
      prisma.cartNumber.findFirst.mockResolvedValue(null);
      prisma.cartNumber.create.mockResolvedValue(makeCartRow());
      prisma.cartProduct.findUnique.mockResolvedValue(null);

      await expect(service.removeItem(userId, skuId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.cartNumber.create).toHaveBeenCalled();
    });
  });
});
