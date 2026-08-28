import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { VariantsService } from './variants.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateProductVariantDto } from '../products/dto/create-product-variant.dto.js';
import type { JwtPayload } from '../auth/jwt-payload.interface.js';
import { Role } from '../generated/prisma/enums.js';

describe('VariantsService', () => {
  let service: VariantsService;
  let prisma: {
    product: {
      findFirst: ReturnType<typeof vi.fn>;
    };
    productVariant: {
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };

  const managerUser: JwtPayload = { sub: 'user-1', role: Role.manager };
  const clientUser: JwtPayload = { sub: 'user-2', role: Role.client };

  const enabledProductRow = {
    id: 'product-1',
    name: 'Classic Tee',
    status: 'enabled',
    deletedAt: null,
  };

  const disabledProductRow = {
    ...enabledProductRow,
    status: 'disabled',
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
    images: [],
    deletedAt: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  };

  const disabledVariantRow = {
    ...variantRow,
    id: 'variant-2',
    status: 'disabled',
  };

  const setupService = async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [VariantsService, PrismaService],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    return moduleRef.get(VariantsService);
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findFirst: vi.fn(),
      },
      productVariant: {
        findMany: vi.fn(),
        create: vi.fn(),
      },
    };
    prisma.product.findFirst.mockResolvedValue(null);
    prisma.productVariant.findMany.mockResolvedValue([]);

    service = await setupService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findMany', () => {
    describe('product visibility', () => {
      it('throws NotFoundException when the product does not exist, for an anonymous caller', async () => {
        prisma.product.findFirst.mockResolvedValue(null);

        await expect(
          service.findMany('missing-product', undefined),
        ).rejects.toThrow(NotFoundException);
      });

      it('throws NotFoundException when the product does not exist, for a manager caller', async () => {
        prisma.product.findFirst.mockResolvedValue(null);

        await expect(
          service.findMany('missing-product', managerUser),
        ).rejects.toThrow(NotFoundException);
      });

      it('throws NotFoundException for a disabled product, for an anonymous caller', async () => {
        prisma.product.findFirst.mockResolvedValue(null);

        await expect(service.findMany('product-1', undefined)).rejects.toThrow(
          NotFoundException,
        );
      });

      it('throws NotFoundException for a disabled product, for a client caller', async () => {
        prisma.product.findFirst.mockResolvedValue(null);

        await expect(service.findMany('product-1', clientUser)).rejects.toThrow(
          NotFoundException,
        );
      });

      it('does not throw for a disabled product when the caller is a manager', async () => {
        prisma.product.findFirst.mockResolvedValue(disabledProductRow);
        prisma.productVariant.findMany.mockResolvedValue([variantRow]);

        await expect(
          service.findMany('product-1', managerUser),
        ).resolves.not.toThrow();
      });

      it('does not throw for a soft-deleted product target being treated as not found (findFirst returns null)', async () => {
        prisma.product.findFirst.mockResolvedValue(null);

        await expect(
          service.findMany('product-1', managerUser),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('variant filtering', () => {
      it('returns enabled variants of an enabled product for an anonymous caller', async () => {
        prisma.product.findFirst.mockResolvedValue(enabledProductRow);
        prisma.productVariant.findMany.mockResolvedValue([variantRow]);

        const result = await service.findMany('product-1', undefined);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ id: 'variant-1', status: 'enabled' });
      });

      it('returns enabled variants of an enabled product for a client caller', async () => {
        prisma.product.findFirst.mockResolvedValue(enabledProductRow);
        prisma.productVariant.findMany.mockResolvedValue([variantRow]);

        const result = await service.findMany('product-1', clientUser);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ id: 'variant-1', status: 'enabled' });
      });

      it('returns both enabled and disabled variants of a disabled product for a manager caller', async () => {
        prisma.product.findFirst.mockResolvedValue(disabledProductRow);
        prisma.productVariant.findMany.mockResolvedValue([
          variantRow,
          disabledVariantRow,
        ]);

        const result = await service.findMany('product-1', managerUser);

        expect(result).toHaveLength(2);
      });

      it('does not return disabled variants to a non-manager caller even within an enabled product', async () => {
        prisma.product.findFirst.mockResolvedValue(enabledProductRow);
        prisma.productVariant.findMany.mockResolvedValue([variantRow]);

        await service.findMany('product-1', clientUser);

        const [args] = prisma.productVariant.findMany.mock.calls[0] as [
          { where?: Record<string, unknown> },
        ];
        expect(args.where).toMatchObject({ status: 'enabled' });
      });

      it('does not restrict variant status for a manager caller', async () => {
        prisma.product.findFirst.mockResolvedValue(enabledProductRow);
        prisma.productVariant.findMany.mockResolvedValue([variantRow]);

        await service.findMany('product-1', managerUser);

        const [args] = prisma.productVariant.findMany.mock.calls[0] as [
          { where?: { status?: unknown } },
        ];
        expect(args.where?.status).not.toBe('enabled');
      });

      it('excludes soft-deleted variants from the query for any caller', async () => {
        prisma.product.findFirst.mockResolvedValue(enabledProductRow);
        prisma.productVariant.findMany.mockResolvedValue([variantRow]);

        await service.findMany('product-1', managerUser);

        const [args] = prisma.productVariant.findMany.mock.calls[0] as [
          { where?: Record<string, unknown> },
        ];
        expect(args.where).toMatchObject({ deletedAt: null });
      });

      it('works when the caller is omitted entirely, same as anonymous', async () => {
        prisma.product.findFirst.mockResolvedValue(enabledProductRow);
        prisma.productVariant.findMany.mockResolvedValue([variantRow]);

        const result = await service.findMany('product-1');

        expect(result).toHaveLength(1);
      });

      it('scopes the variants query to the given productId', async () => {
        prisma.product.findFirst.mockResolvedValue(enabledProductRow);
        prisma.productVariant.findMany.mockResolvedValue([variantRow]);

        await service.findMany('product-1', managerUser);

        const [args] = prisma.productVariant.findMany.mock.calls[0] as [
          { where?: Record<string, unknown> },
        ];
        expect(args.where).toMatchObject({ productId: 'product-1' });
      });

      it('resolves an empty array without throwing when there are no matching variants', async () => {
        prisma.product.findFirst.mockResolvedValue(enabledProductRow);
        prisma.productVariant.findMany.mockResolvedValue([]);

        const result = await service.findMany('product-1', managerUser);

        expect(result).toEqual([]);
      });
    });
  });

  describe('create', () => {
    const dto: CreateProductVariantDto = {
      size: 'm',
      color: 'black',
      fit: 'regular',
      gender: 'men',
      stock: 10,
      price: 29.99,
    };

    it('throws NotFoundException when the target product does not exist', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.create('missing-product', dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.productVariant.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the target product is soft-deleted', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.create('product-1', dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.productVariant.create).not.toHaveBeenCalled();
    });

    it('allows creating a variant under a disabled (but not deleted) product', async () => {
      prisma.product.findFirst.mockResolvedValue(disabledProductRow);
      prisma.productVariant.create.mockResolvedValue(variantRow);

      await expect(service.create('product-1', dto)).resolves.not.toThrow();
      expect(prisma.productVariant.create).toHaveBeenCalled();
    });

    it('creates the variant with the fields from the dto, associated with productId', async () => {
      prisma.product.findFirst.mockResolvedValue(enabledProductRow);
      prisma.productVariant.create.mockResolvedValue(variantRow);

      await service.create('product-1', dto);

      const [args] = prisma.productVariant.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data).toMatchObject({
        productId: 'product-1',
        size: dto.size,
        color: dto.color,
        fit: dto.fit,
        gender: dto.gender,
        stock: dto.stock,
        price: dto.price,
      });
    });

    it('returns the created variant reflecting the row', async () => {
      prisma.product.findFirst.mockResolvedValue(enabledProductRow);
      prisma.productVariant.create.mockResolvedValue(variantRow);

      const result = await service.create('product-1', dto);

      expect(result).toMatchObject({
        id: 'variant-1',
        productId: 'product-1',
        size: 'm',
        color: 'black',
        fit: 'regular',
        gender: 'men',
        stock: 10,
      });
      expect(typeof result.price).toBe('number');
      expect(result.price).toBe(29.99);
    });
  });
});
