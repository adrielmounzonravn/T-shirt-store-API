import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ProductsService } from './products.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import type { JwtPayload } from '../auth/jwt-payload.interface.js';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: {
    product: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
  };

  const managerUser: JwtPayload = { sub: 'user-1', role: 'manager' };
  const clientUser: JwtPayload = { sub: 'user-2', role: 'client' };

  const image = {
    id: 'image-1',
    productId: 'product-1',
    imagePath: '/images/product-1.jpg',
    isCover: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  };

  const productRow = {
    id: 'product-1',
    name: 'Classic Tee',
    detail: 'A classic t-shirt',
    status: 'enabled',
    images: [image],
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  };

  const baseQuery: ListProductsQueryDto = {
    limit: 20,
    offset: 0,
  };

  const setupService = async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ProductsService, PrismaService],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    return moduleRef.get(ProductsService);
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };
    prisma.product.findMany.mockResolvedValue([productRow]);
    prisma.product.count.mockResolvedValue(1);

    service = await setupService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const getFindManyWhere = () =>
    (prisma.product.findMany.mock.calls[0] as [{ where?: unknown }])[0]?.where;

  const getCountWhere = () =>
    (prisma.product.count.mock.calls[0] as [{ where?: unknown }])[0]?.where;

  describe('soft-delete filtering', () => {
    it('excludes soft-deleted products for an anonymous caller', async () => {
      await service.findMany(baseQuery, undefined);

      expect(getFindManyWhere()).toMatchObject({ deletedAt: null });
      expect(getCountWhere()).toMatchObject({ deletedAt: null });
    });

    it('excludes soft-deleted products for a client caller', async () => {
      await service.findMany(baseQuery, clientUser);

      expect(getFindManyWhere()).toMatchObject({ deletedAt: null });
      expect(getCountWhere()).toMatchObject({ deletedAt: null });
    });

    it('excludes soft-deleted products for a manager caller too', async () => {
      await service.findMany(baseQuery, managerUser);

      expect(getFindManyWhere()).toMatchObject({ deletedAt: null });
      expect(getCountWhere()).toMatchObject({ deletedAt: null });
    });
  });

  describe('status visibility for anonymous/client callers', () => {
    it('forces status enabled for an anonymous caller when query.status is not set', async () => {
      await service.findMany(baseQuery, undefined);

      expect(getFindManyWhere()).toMatchObject({ status: 'enabled' });
      expect(getCountWhere()).toMatchObject({ status: 'enabled' });
    });

    it('clamps to status enabled for an anonymous caller even when query.status is disabled', async () => {
      await service.findMany({ ...baseQuery, status: 'disabled' }, undefined);

      expect(getFindManyWhere()).toMatchObject({ status: 'enabled' });
      expect(getCountWhere()).toMatchObject({ status: 'enabled' });
    });

    it('forces status enabled for a client caller when query.status is not set', async () => {
      await service.findMany(baseQuery, clientUser);

      expect(getFindManyWhere()).toMatchObject({ status: 'enabled' });
      expect(getCountWhere()).toMatchObject({ status: 'enabled' });
    });

    it('clamps to status enabled for a client caller even when query.status is disabled', async () => {
      await service.findMany({ ...baseQuery, status: 'disabled' }, clientUser);

      expect(getFindManyWhere()).toMatchObject({ status: 'enabled' });
      expect(getCountWhere()).toMatchObject({ status: 'enabled' });
    });
  });

  describe('status visibility for manager callers', () => {
    it('does not force status enabled when query.status is not set', async () => {
      await service.findMany(baseQuery, managerUser);

      const where = getFindManyWhere() as { status?: unknown };
      expect(where.status).not.toBe('enabled');
    });

    it('reflects status disabled when the manager explicitly requests it', async () => {
      await service.findMany({ ...baseQuery, status: 'disabled' }, managerUser);

      expect(getFindManyWhere()).toMatchObject({ status: 'disabled' });
      expect(getCountWhere()).toMatchObject({ status: 'disabled' });
    });

    it('reflects status enabled when the manager explicitly requests it', async () => {
      await service.findMany({ ...baseQuery, status: 'enabled' }, managerUser);

      expect(getFindManyWhere()).toMatchObject({ status: 'enabled' });
      expect(getCountWhere()).toMatchObject({ status: 'enabled' });
    });
  });

  describe('category filters via variants', () => {
    it('translates a single gender filter into a variants.some clause without other fields', async () => {
      await service.findMany({ ...baseQuery, gender: 'men' }, managerUser);

      const where = getFindManyWhere() as {
        variants: { some: Record<string, unknown> };
      };
      expect(where.variants.some).toMatchObject({
        deletedAt: null,
        gender: 'men',
      });
      expect(where.variants.some).not.toHaveProperty('size');
      expect(where.variants.some).not.toHaveProperty('fit');
      expect(where.variants.some).not.toHaveProperty('color');
    });

    it('combines multiple category filters into a single variants.some clause', async () => {
      await service.findMany(
        {
          ...baseQuery,
          gender: 'women',
          size: 'm',
          fit: 'slim',
          color: 'black',
        },
        managerUser,
      );

      const where = getFindManyWhere() as {
        variants: { some: Record<string, unknown> };
      };
      expect(where.variants.some).toMatchObject({
        deletedAt: null,
        gender: 'women',
        size: 'm',
        fit: 'slim',
        color: 'black',
      });
    });

    it('does not require a variants match when no category filters are set', async () => {
      await service.findMany(baseQuery, managerUser);

      const where = getFindManyWhere() as { variants?: unknown };
      expect(where.variants).toBeUndefined();
    });

    it('applies the same category filter to both findMany and count', async () => {
      await service.findMany({ ...baseQuery, fit: 'oversize' }, managerUser);

      const findManyWhere = getFindManyWhere() as {
        variants: { some: Record<string, unknown> };
      };
      const countWhere = getCountWhere() as {
        variants: { some: Record<string, unknown> };
      };
      expect(findManyWhere.variants.some).toMatchObject({ fit: 'oversize' });
      expect(countWhere.variants.some).toMatchObject({ fit: 'oversize' });
    });
  });

  describe('pagination', () => {
    it('forwards limit/offset to take/skip on findMany', async () => {
      await service.findMany({ limit: 5, offset: 15 }, managerUser);

      const [options] = prisma.product.findMany.mock.calls[0] as [
        { take?: number; skip?: number },
      ];
      expect(options.take).toBe(5);
      expect(options.skip).toBe(15);
    });

    it('echoes the requested limit/offset back in pagination', async () => {
      const result = await service.findMany(
        { limit: 5, offset: 15 },
        managerUser,
      );

      expect(result.pagination.limit).toBe(5);
      expect(result.pagination.offset).toBe(15);
    });
  });

  describe('total count', () => {
    it('reflects the count mock value, independent of the findMany page size', async () => {
      prisma.product.findMany.mockResolvedValue([productRow, productRow]);
      prisma.product.count.mockResolvedValue(42);

      const result = await service.findMany(baseQuery, managerUser);

      expect(result.pagination.total).toBe(42);
      expect(result.data).not.toHaveLength(42);
    });
  });

  describe('images', () => {
    it('requests the images relation on the findMany call', async () => {
      await service.findMany(baseQuery, managerUser);

      const [options] = prisma.product.findMany.mock.calls[0] as [
        { include?: Record<string, unknown>; select?: Record<string, unknown> },
      ];
      const requestsImages =
        options.include?.images !== undefined ||
        options.select?.images !== undefined;
      expect(requestsImages).toBe(true);
    });

    it('returns the images nested under each product in data', async () => {
      const result = await service.findMany(baseQuery, managerUser);

      expect(result.data[0].images).toEqual([expect.objectContaining(image)]);
    });
  });

  describe('result shape', () => {
    it('resolves data reflecting the findMany rows in order and content', async () => {
      const secondProduct = {
        ...productRow,
        id: 'product-2',
        name: 'Another Tee',
      };
      prisma.product.findMany.mockResolvedValue([productRow, secondProduct]);
      prisma.product.count.mockResolvedValue(2);

      const result = await service.findMany(baseQuery, managerUser);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({
        id: 'product-1',
        name: 'Classic Tee',
      });
      expect(result.data[1]).toMatchObject({
        id: 'product-2',
        name: 'Another Tee',
      });
    });

    it('resolves an empty result set without throwing', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      const result = await service.findMany(baseQuery, managerUser);

      expect(result).toEqual({
        data: [],
        pagination: {
          limit: baseQuery.limit,
          offset: baseQuery.offset,
          total: 0,
        },
      });
    });
  });
});
