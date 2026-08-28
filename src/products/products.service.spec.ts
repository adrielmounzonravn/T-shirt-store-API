import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { JwtPayload } from '../auth/jwt-payload.interface.js';
import { Role } from '../generated/prisma/enums.js';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: {
    product: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn<(arg: unknown) => Promise<unknown>>>;
  };

  const managerUser: JwtPayload = { sub: 'user-1', role: Role.manager };
  const clientUser: JwtPayload = { sub: 'user-2', role: Role.client };

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

  const variantImage = {
    id: 'variant-image-1',
    variantId: 'variant-1',
    imagePath: '/images/variant-1.jpg',
    isCover: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  };

  const variantRow = {
    id: 'variant-1',
    productId: 'product-1',
    size: 'm',
    color: 'black',
    fit: 'regular',
    gender: 'men',
    stock: 10,
    price: '29.99',
    status: 'enabled',
    images: [variantImage],
    deletedAt: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  };

  const productDetailRow = {
    ...productRow,
    deletedAt: null,
    variants: [variantRow],
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
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      $transaction: vi.fn<(arg: unknown) => Promise<unknown>>(),
    };
    prisma.product.findMany.mockResolvedValue([productRow]);
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        return Promise.resolve((arg as (tx: typeof prisma) => unknown)(prisma));
      }
      return Promise.all(arg as Promise<unknown>[]);
    });

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

  describe('findOne', () => {
    const getFindFirstArgs = () =>
      (
        prisma.product.findFirst.mock.calls[0] as [
          {
            where?: Record<string, unknown>;
            include?: Record<string, unknown>;
          },
        ]
      )[0];

    describe('soft-delete filtering', () => {
      it('throws NotFoundException when the product row does not exist', async () => {
        prisma.product.findFirst.mockResolvedValue(null);

        await expect(
          service.findOne('missing-product', undefined),
        ).rejects.toThrow(NotFoundException);
      });

      it('throws NotFoundException when the product is soft-deleted, for an anonymous caller', async () => {
        prisma.product.findFirst.mockResolvedValue(null);

        await expect(service.findOne('product-1', undefined)).rejects.toThrow(
          NotFoundException,
        );
      });

      it('throws NotFoundException when the product is soft-deleted, for a client caller', async () => {
        prisma.product.findFirst.mockResolvedValue(null);

        await expect(service.findOne('product-1', clientUser)).rejects.toThrow(
          NotFoundException,
        );
      });

      it('throws NotFoundException when the product is soft-deleted, even for a manager caller', async () => {
        prisma.product.findFirst.mockResolvedValue(null);

        await expect(service.findOne('product-1', managerUser)).rejects.toThrow(
          NotFoundException,
        );
      });

      it('filters on deletedAt: null in the findFirst where clause', async () => {
        prisma.product.findFirst.mockResolvedValue(productDetailRow);

        await service.findOne('product-1', managerUser);

        expect(getFindFirstArgs().where).toMatchObject({
          id: 'product-1',
          deletedAt: null,
        });
      });
    });

    describe('variant soft-delete filtering', () => {
      const getVariantsWhere = () => {
        const args = getFindFirstArgs();
        const variantsInclude = args.include?.variants as
          { where?: Record<string, unknown> } | true | undefined;
        return variantsInclude && variantsInclude !== true
          ? variantsInclude.where
          : undefined;
      };

      it('requests only non-soft-deleted variants in the query, for an anonymous caller', async () => {
        prisma.product.findFirst.mockResolvedValue(productDetailRow);

        await service.findOne('product-1', undefined);

        expect(getVariantsWhere()).toMatchObject({ deletedAt: null });
      });

      it('requests only non-soft-deleted variants in the query, even for a manager caller', async () => {
        prisma.product.findFirst.mockResolvedValue(productDetailRow);

        await service.findOne('product-1', managerUser);

        expect(getVariantsWhere()).toMatchObject({ deletedAt: null });
      });
    });

    describe('status visibility', () => {
      it('throws NotFoundException for an anonymous caller requesting a disabled product', async () => {
        prisma.product.findFirst.mockResolvedValue(null);

        await expect(service.findOne('product-1', undefined)).rejects.toThrow(
          NotFoundException,
        );
      });

      it('throws NotFoundException for a client caller requesting a disabled product', async () => {
        prisma.product.findFirst.mockResolvedValue(null);

        await expect(service.findOne('product-1', clientUser)).rejects.toThrow(
          NotFoundException,
        );
      });

      it('returns the product for a manager caller requesting a disabled product', async () => {
        prisma.product.findFirst.mockResolvedValue({
          ...productDetailRow,
          status: 'disabled',
        });

        const result = await service.findOne('product-1', managerUser);

        expect(result.status).toBe('disabled');
      });
    });

    describe('query shape', () => {
      it('queries a single row keyed by id with deletedAt: null in where', async () => {
        prisma.product.findFirst.mockResolvedValue(productDetailRow);

        await service.findOne('product-1', managerUser);

        const args = getFindFirstArgs();
        expect(args.where).toMatchObject({
          id: 'product-1',
          deletedAt: null,
        });
      });

      it('eagerly includes images and variants (with nested variant images) in one query', async () => {
        prisma.product.findFirst.mockResolvedValue(productDetailRow);

        await service.findOne('product-1', managerUser);

        const args = getFindFirstArgs();
        expect(args.include).toHaveProperty('images');
        expect(args.include).toHaveProperty('variants');

        const variantsInclude = args.include?.variants as
          { include?: Record<string, unknown> } | true | undefined;
        if (variantsInclude && variantsInclude !== true) {
          expect(variantsInclude.include).toHaveProperty('images');
        }
      });
    });

    describe('response shape', () => {
      it('carries through the product own fields', async () => {
        prisma.product.findFirst.mockResolvedValue(productDetailRow);

        const result = await service.findOne('product-1', managerUser);

        expect(result).toMatchObject({
          id: 'product-1',
          name: 'Classic Tee',
          detail: 'A classic t-shirt',
          status: 'enabled',
          images: [expect.objectContaining(image)],
          createdAt: productDetailRow.createdAt,
          updatedAt: productDetailRow.updatedAt,
        });
      });

      it('carries through each variant own fields including nested images', async () => {
        prisma.product.findFirst.mockResolvedValue(productDetailRow);

        const result = await service.findOne('product-1', managerUser);

        expect(result.variants).toHaveLength(1);
        expect(result.variants[0]).toMatchObject({
          id: 'variant-1',
          productId: 'product-1',
          size: 'm',
          color: 'black',
          fit: 'regular',
          gender: 'men',
          stock: 10,
          status: 'enabled',
          images: [expect.objectContaining(variantImage)],
          createdAt: variantRow.createdAt,
          updatedAt: variantRow.updatedAt,
        });
      });

      it('converts each variant price to a JS number', async () => {
        prisma.product.findFirst.mockResolvedValue(productDetailRow);

        const result = await service.findOne('product-1', managerUser);

        expect(typeof result.variants[0].price).toBe('number');
        expect(result.variants[0].price).toBe(29.99);
      });
    });
  });

  describe('create', () => {
    const variantDto = {
      size: 'm',
      color: 'black',
      fit: 'regular',
      gender: 'men',
      stock: 10,
      price: 29.99,
    };

    const getCreateArgs = () =>
      (
        prisma.product.create.mock.calls[0] as [
          { data: Record<string, unknown> },
        ]
      )[0];

    describe('with variants', () => {
      const dto: CreateProductDto = {
        name: 'Classic Tee',
        detail: 'A classic t-shirt',
        variants: [variantDto],
      } as CreateProductDto;

      beforeEach(() => {
        prisma.product.create.mockResolvedValue({
          ...productDetailRow,
          status: 'enabled',
        });
      });

      it('creates the product with status enabled', async () => {
        await service.create(dto);

        expect(getCreateArgs().data).toMatchObject({ status: 'enabled' });
      });

      it('passes the variants through to the nested create', async () => {
        await service.create(dto);

        const data = getCreateArgs().data as {
          variants?: { create?: unknown[] };
        };
        expect(data.variants?.create).toEqual([
          expect.objectContaining(variantDto),
        ]);
      });

      it('returns a ProductDetailEntity reflecting the created product and variants', async () => {
        const result = await service.create(dto);

        expect(result.status).toBe('enabled');
        expect(result.variants).toHaveLength(1);
        expect(result.variants[0]).toMatchObject({
          id: 'variant-1',
          productId: 'product-1',
        });
        expect(typeof result.variants[0].price).toBe('number');
      });
    });

    describe('without variants', () => {
      const dto: CreateProductDto = {
        name: 'Classic Tee',
        detail: 'A classic t-shirt',
      };

      beforeEach(() => {
        prisma.product.create.mockResolvedValue({
          ...productDetailRow,
          status: 'disabled',
          variants: [],
        });
      });

      it('creates the product with status disabled', async () => {
        await service.create(dto);

        expect(getCreateArgs().data).toMatchObject({ status: 'disabled' });
      });

      it('does not include a nested variants create', async () => {
        await service.create(dto);

        const data = getCreateArgs().data as {
          variants?: { create?: unknown[] };
        };
        expect(data.variants?.create ?? []).toHaveLength(0);
      });

      it('returns a ProductDetailEntity with an empty variants array', async () => {
        const result = await service.create(dto);

        expect(result.status).toBe('disabled');
        expect(result.variants).toEqual([]);
      });
    });

    describe('with an empty variants array', () => {
      const dto: CreateProductDto = {
        name: 'Classic Tee',
        detail: 'A classic t-shirt',
        variants: [],
      };

      beforeEach(() => {
        prisma.product.create.mockResolvedValue({
          ...productDetailRow,
          status: 'disabled',
          variants: [],
        });
      });

      it('treats an empty variants array the same as no variants: status disabled', async () => {
        await service.create(dto);

        expect(getCreateArgs().data).toMatchObject({ status: 'disabled' });
      });

      it('does not include a nested variants create for an empty array', async () => {
        await service.create(dto);

        const data = getCreateArgs().data as {
          variants?: { create?: unknown[] };
        };
        expect(data.variants?.create ?? []).toHaveLength(0);
      });
    });
  });

  describe('update', () => {
    const getUpdateArgs = () =>
      (
        prisma.product.update.mock.calls[0] as [
          { where?: Record<string, unknown>; data?: Record<string, unknown> },
        ]
      )[0];

    it('updates only the fields provided in a partial dto', async () => {
      prisma.product.findFirst.mockResolvedValue(productRow);
      prisma.product.update.mockResolvedValue({
        ...productRow,
        name: 'New Name',
      });

      await service.update('product-1', { name: 'New Name' });

      expect(getUpdateArgs().where).toMatchObject({ id: 'product-1' });
      expect(getUpdateArgs().data).toMatchObject({ name: 'New Name' });
      expect(getUpdateArgs().data).not.toHaveProperty('detail');
    });

    it('returns a ProductEntity reflecting the updated row', async () => {
      prisma.product.findFirst.mockResolvedValue(productRow);
      prisma.product.update.mockResolvedValue({
        ...productRow,
        name: 'New Name',
      });

      const result = await service.update('product-1', { name: 'New Name' });

      expect(result).toMatchObject({ id: 'product-1', name: 'New Name' });
    });

    it('throws NotFoundException when no active product with that id exists', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.update('missing-product', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a soft-deleted product', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.update('product-1', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes by setting deletedAt, without calling delete', async () => {
      prisma.product.findFirst.mockResolvedValue(productRow);
      prisma.product.update.mockResolvedValue({
        ...productRow,
        deletedAt: new Date('2024-02-01T00:00:00.000Z'),
      });

      await service.remove('product-1');

      const [args] = prisma.product.update.mock.calls[0] as [
        { where?: Record<string, unknown>; data?: Record<string, unknown> },
      ];
      expect(args.where).toMatchObject({ id: 'product-1' });
      expect(args.data?.deletedAt).toBeInstanceOf(Date);
      expect(prisma.product.delete).not.toHaveBeenCalled();
    });

    it('resolves without a return value', async () => {
      prisma.product.findFirst.mockResolvedValue(productRow);
      prisma.product.update.mockResolvedValue({
        ...productRow,
        deletedAt: new Date('2024-02-01T00:00:00.000Z'),
      });

      const result = await service.remove('product-1');

      expect(result).toBeUndefined();
    });

    it('throws NotFoundException when no active product with that id exists', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.remove('missing-product')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(prisma.product.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an already soft-deleted product', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.remove('product-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(prisma.product.delete).not.toHaveBeenCalled();
    });
  });
});
