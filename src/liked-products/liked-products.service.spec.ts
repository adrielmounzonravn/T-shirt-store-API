import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LikedProductsService } from './liked-products.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ListLikedProductsQueryDto } from './dto/list-liked-products-query.dto.js';

describe('LikedProductsService', () => {
  let service: LikedProductsService;
  let prisma: {
    likedProduct: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    product: {
      findFirst: ReturnType<typeof vi.fn>;
    };
  };

  const userId = 'user-1';
  const otherUserId = 'user-2';
  const productId = 'product-1';

  const likedProductRow = {
    userId,
    productId,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  };

  const baseQuery: ListLikedProductsQueryDto = {
    limit: 20,
    offset: 0,
  };

  const setupService = async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [LikedProductsService, PrismaService],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    return moduleRef.get(LikedProductsService);
  };

  beforeEach(async () => {
    prisma = {
      likedProduct: {
        findMany: vi.fn(),
        count: vi.fn(),
        upsert: vi.fn(),
        deleteMany: vi.fn(),
        findFirst: vi.fn(),
      },
      product: {
        findFirst: vi.fn(),
      },
    };

    prisma.likedProduct.findMany.mockResolvedValue([likedProductRow]);
    prisma.likedProduct.count.mockResolvedValue(1);
    prisma.likedProduct.upsert.mockResolvedValue(likedProductRow);
    prisma.likedProduct.deleteMany.mockResolvedValue({ count: 1 });
    prisma.product.findFirst.mockResolvedValue({
      id: productId,
      deletedAt: null,
    });

    service = await setupService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const getFindManyArgs = () =>
    prisma.likedProduct.findMany.mock.calls[0] as [
      { where?: unknown; take?: unknown; skip?: unknown },
    ];

  const getCountArgs = () =>
    prisma.likedProduct.count.mock.calls[0] as [{ where?: unknown }];

  describe('findMany', () => {
    it('returns liked productIds only, not full objects', async () => {
      const result = await service.findMany(userId, baseQuery);

      expect(result.data).toEqual([productId]);
    });

    it('returns pagination metadata from the query and total count', async () => {
      prisma.likedProduct.count.mockResolvedValue(42);

      const result = await service.findMany(userId, {
        limit: 5,
        offset: 10,
      });

      expect(result.pagination).toEqual({ limit: 5, offset: 10, total: 42 });
    });

    it('scopes the findMany query to the given userId', async () => {
      await service.findMany(userId, baseQuery);

      const [args] = getFindManyArgs();
      expect(args.where).toMatchObject({ userId });
    });

    it('scopes the count query to the given userId', async () => {
      await service.findMany(userId, baseQuery);

      const [args] = getCountArgs();
      expect(args.where).toMatchObject({ userId });
    });

    it('does not leak another user liked products into the where clause', async () => {
      await service.findMany(userId, baseQuery);

      const [args] = getFindManyArgs();
      expect(args.where).not.toMatchObject({ userId: otherUserId });
    });

    it('passes limit through to Prisma as take', async () => {
      await service.findMany(userId, { limit: 7, offset: 0 });

      const [args] = getFindManyArgs();
      expect(args.take).toBe(7);
    });

    it('passes offset through to Prisma as skip', async () => {
      await service.findMany(userId, { limit: 20, offset: 15 });

      const [args] = getFindManyArgs();
      expect(args.skip).toBe(15);
    });

    it('applies default limit and offset when not provided beyond DTO defaults', async () => {
      await service.findMany(userId, baseQuery);

      const [args] = getFindManyArgs();
      expect(args.take).toBe(20);
      expect(args.skip).toBe(0);
    });

    it('returns an empty data array when the user has no liked products', async () => {
      prisma.likedProduct.findMany.mockResolvedValue([]);
      prisma.likedProduct.count.mockResolvedValue(0);

      const result = await service.findMany(userId, baseQuery);

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    it('preserves the order returned by Prisma when mapping to productIds', async () => {
      prisma.likedProduct.findMany.mockResolvedValue([
        { ...likedProductRow, productId: 'product-2' },
        { ...likedProductRow, productId: 'product-1' },
      ]);

      const result = await service.findMany(userId, baseQuery);

      expect(result.data).toEqual(['product-2', 'product-1']);
    });
  });

  describe('like', () => {
    it('checks that the product exists and is not soft-deleted before liking', async () => {
      await service.like(userId, productId);

      expect(prisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: productId,
            deletedAt: null,
          }) as unknown,
        }),
      );
    });

    it('upserts the liked product on the composite userId_productId key', async () => {
      await service.like(userId, productId);

      expect(prisma.likedProduct.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId_productId: { userId, productId },
          }) as unknown,
        }),
      );
    });

    it('throws NotFoundException when the product does not exist', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.like(userId, productId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.likedProduct.upsert).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the product is soft-deleted', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.like(userId, productId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.likedProduct.upsert).not.toHaveBeenCalled();
    });

    it('is idempotent: liking an already-liked product does not throw', async () => {
      await service.like(userId, productId);
      await expect(service.like(userId, productId)).resolves.not.toThrow();

      expect(prisma.likedProduct.upsert).toHaveBeenCalledTimes(2);
    });

    it('does not create a duplicate row when liking an already-liked product (upsert, not create)', async () => {
      await service.like(userId, productId);

      expect(prisma.likedProduct.upsert).toHaveBeenCalled();
      const call = prisma.likedProduct.upsert.mock.calls[0][0] as {
        create?: unknown;
        update?: unknown;
      };
      expect(call).toHaveProperty('create');
      expect(call).toHaveProperty('update');
    });
  });

  describe('unlike', () => {
    it('removes the liked product for the given user', async () => {
      await service.unlike(userId, productId);

      expect(prisma.likedProduct.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId, productId }) as unknown,
        }),
      );
    });

    it('is idempotent: unliking a product that was never liked does not throw', async () => {
      prisma.likedProduct.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.unlike(userId, productId)).resolves.not.toThrow();
    });

    it('does not check product existence before unliking', async () => {
      await service.unlike(userId, productId);

      expect(prisma.product.findFirst).not.toHaveBeenCalled();
    });

    it('only removes the like scoped to the given userId, not other users likes', async () => {
      await service.unlike(userId, productId);

      const call = prisma.likedProduct.deleteMany.mock.calls[0][0] as {
        where?: { userId?: string };
      };
      expect(call.where?.userId).toBe(userId);
      expect(call.where?.userId).not.toBe(otherUserId);
    });
  });
});
