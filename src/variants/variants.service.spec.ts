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
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
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
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    prisma.product.findFirst.mockResolvedValue(null);
    prisma.productVariant.findMany.mockResolvedValue([]);
    prisma.productVariant.findFirst.mockResolvedValue(null);

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
        expect(result[0]).toMatchObject({
          skuId: 'variant-1',
          status: 'enabled',
        });
      });

      it('returns enabled variants of an enabled product for a client caller', async () => {
        prisma.product.findFirst.mockResolvedValue(enabledProductRow);
        prisma.productVariant.findMany.mockResolvedValue([variantRow]);

        const result = await service.findMany('product-1', clientUser);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          skuId: 'variant-1',
          status: 'enabled',
        });
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
        skuId: 'variant-1',
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

  describe('findOne', () => {
    it('throws NotFoundException when no variant matches the skuId, for an anonymous caller', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing-sku', undefined)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when no variant matches the skuId, for a manager caller', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing-sku', managerUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for a soft-deleted variant, treated as not found (findFirst returns null)', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);

      await expect(service.findOne('variant-1', managerUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for a client caller when the variant itself is disabled', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);

      await expect(service.findOne('variant-2', clientUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for an anonymous caller when the parent product is disabled', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);

      await expect(service.findOne('variant-1', undefined)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('resolves the variant for an anonymous caller when the variant and its product are both enabled', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);

      await expect(
        service.findOne('variant-1', undefined),
      ).resolves.not.toThrow();
    });

    it('resolves the variant for a client caller when the variant and its product are both enabled', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);

      await expect(
        service.findOne('variant-1', clientUser),
      ).resolves.not.toThrow();
    });

    it('resolves a disabled variant for a manager caller', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(disabledVariantRow);

      await expect(
        service.findOne('variant-2', managerUser),
      ).resolves.not.toThrow();
    });

    it('resolves a variant whose parent product is disabled for a manager caller', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);

      await expect(
        service.findOne('variant-1', managerUser),
      ).resolves.not.toThrow();
    });

    it('restricts the query to enabled status for a non-manager caller', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);

      await service.findOne('variant-1', clientUser);

      const [args] = prisma.productVariant.findFirst.mock.calls[0] as [
        { where?: Record<string, unknown> },
      ];
      expect(args.where).toMatchObject({ status: 'enabled' });
    });

    it('does not restrict variant status in the query for a manager caller', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);

      await service.findOne('variant-1', managerUser);

      const [args] = prisma.productVariant.findFirst.mock.calls[0] as [
        { where?: { status?: unknown } },
      ];
      expect(args.where?.status).not.toBe('enabled');
    });

    it('excludes soft-deleted variants from the query for any caller', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);

      await service.findOne('variant-1', managerUser);

      const [args] = prisma.productVariant.findFirst.mock.calls[0] as [
        { where?: Record<string, unknown> },
      ];
      expect(args.where).toMatchObject({ deletedAt: null });
    });

    it('resolves a ProductVariantEntity reflecting the row, with price normalized to a number', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);

      const result = await service.findOne('variant-1', managerUser);

      expect(result).toMatchObject({
        skuId: 'variant-1',
        productId: 'product-1',
        size: 'm',
        color: 'black',
        fit: 'regular',
        gender: 'men',
        stock: 10,
        status: 'enabled',
      });
      expect(typeof result.price).toBe('number');
      expect(result.price).toBe(29.99);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the target variant does not exist', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);

      await expect(service.update('missing-sku', { stock: 5 })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the target variant is soft-deleted', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);

      await expect(service.update('variant-1', { stock: 5 })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
    });

    it('allows updating a disabled variant', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(disabledVariantRow);
      prisma.productVariant.update.mockResolvedValue(disabledVariantRow);

      await expect(
        service.update('variant-2', { stock: 5 }),
      ).resolves.not.toThrow();
      expect(prisma.productVariant.update).toHaveBeenCalled();
    });

    it('allows updating a variant whose parent product is disabled', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);
      prisma.productVariant.update.mockResolvedValue(variantRow);

      await expect(
        service.update('variant-1', { stock: 5 }),
      ).resolves.not.toThrow();
      expect(prisma.productVariant.update).toHaveBeenCalled();
    });

    it('only updates stock when only stock is provided in the dto', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);
      prisma.productVariant.update.mockResolvedValue({
        ...variantRow,
        stock: 5,
      });

      await service.update('variant-1', { stock: 5 });

      const [args] = prisma.productVariant.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data).toMatchObject({ stock: 5 });
      expect(args.data).not.toHaveProperty('price');
    });

    it('only updates price when only price is provided in the dto', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);
      prisma.productVariant.update.mockResolvedValue({
        ...variantRow,
        price: '19.99',
      });

      await service.update('variant-1', { price: 19.99 });

      const [args] = prisma.productVariant.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data).toMatchObject({ price: 19.99 });
      expect(args.data).not.toHaveProperty('stock');
    });

    it('updates both stock and price when both are provided in the dto', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);
      prisma.productVariant.update.mockResolvedValue({
        ...variantRow,
        stock: 5,
        price: '19.99',
      });

      await service.update('variant-1', { stock: 5, price: 19.99 });

      const [args] = prisma.productVariant.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data).toMatchObject({ stock: 5, price: 19.99 });
    });

    it('resolves the updated ProductVariantEntity reflecting the new row values, with price normalized to a number', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);
      prisma.productVariant.update.mockResolvedValue({
        ...variantRow,
        stock: 5,
        price: '19.99',
      });

      const result = await service.update('variant-1', {
        stock: 5,
        price: 19.99,
      });

      expect(result).toMatchObject({ skuId: 'variant-1', stock: 5 });
      expect(typeof result.price).toBe('number');
      expect(result.price).toBe(19.99);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the target variant does not exist', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);

      await expect(service.remove('missing-sku')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the variant is already soft-deleted', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);

      await expect(service.remove('variant-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException on a second call after the variant has already been removed', async () => {
      prisma.productVariant.findFirst.mockResolvedValueOnce(variantRow);
      prisma.productVariant.update.mockResolvedValueOnce({
        ...variantRow,
        deletedAt: new Date('2024-06-01T00:00:00.000Z'),
      });

      await expect(service.remove('variant-1')).resolves.not.toThrow();

      prisma.productVariant.findFirst.mockResolvedValueOnce(null);

      await expect(service.remove('variant-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('allows removing a variant whose parent product is disabled', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);
      prisma.productVariant.update.mockResolvedValue({
        ...variantRow,
        deletedAt: new Date('2024-06-01T00:00:00.000Z'),
      });

      await expect(service.remove('variant-1')).resolves.not.toThrow();
    });

    it('allows removing a disabled variant', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(disabledVariantRow);
      prisma.productVariant.update.mockResolvedValue({
        ...disabledVariantRow,
        deletedAt: new Date('2024-06-01T00:00:00.000Z'),
      });

      await expect(service.remove('variant-2')).resolves.not.toThrow();
    });

    it('soft deletes by setting deletedAt rather than hard-deleting', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);
      prisma.productVariant.update.mockResolvedValue({
        ...variantRow,
        deletedAt: new Date('2024-06-01T00:00:00.000Z'),
      });

      await service.remove('variant-1');

      const [args] = prisma.productVariant.update.mock.calls[0] as [
        { data?: Record<string, unknown> },
      ];
      expect(args.data).toHaveProperty('deletedAt');
      expect(args.data?.deletedAt).not.toBeNull();
    });

    it('resolves undefined on success', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);
      prisma.productVariant.update.mockResolvedValue({
        ...variantRow,
        deletedAt: new Date('2024-06-01T00:00:00.000Z'),
      });

      const result = await service.remove('variant-1');

      expect(result).toBeUndefined();
    });
  });

  describe('enable', () => {
    it('throws NotFoundException when the target variant does not exist', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);

      await expect(service.enable('missing-sku')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the target variant is soft-deleted', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);

      await expect(service.enable('variant-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
    });

    it('enables a disabled variant', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(disabledVariantRow);
      prisma.productVariant.update.mockResolvedValue({
        ...disabledVariantRow,
        status: 'enabled',
      });

      await expect(service.enable('variant-2')).resolves.not.toThrow();
      expect(prisma.productVariant.update).toHaveBeenCalled();
    });

    it('sets status to enabled in the update call', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(disabledVariantRow);
      prisma.productVariant.update.mockResolvedValue({
        ...disabledVariantRow,
        status: 'enabled',
      });

      await service.enable('variant-2');

      const [args] = prisma.productVariant.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data).toMatchObject({ status: 'enabled' });
    });

    it('succeeds when enabling an already-enabled variant', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);
      prisma.productVariant.update.mockResolvedValue(variantRow);

      await expect(service.enable('variant-1')).resolves.not.toThrow();

      const [args] = prisma.productVariant.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data).toMatchObject({ status: 'enabled' });
    });

    it('allows enabling a variant whose parent product is disabled', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(disabledVariantRow);
      prisma.productVariant.update.mockResolvedValue({
        ...disabledVariantRow,
        status: 'enabled',
      });

      await expect(service.enable('variant-2')).resolves.not.toThrow();
      expect(prisma.productVariant.update).toHaveBeenCalled();
    });

    it('resolves a ProductVariantEntity reflecting the enabled row, with price normalized to a number', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(disabledVariantRow);
      prisma.productVariant.update.mockResolvedValue({
        ...disabledVariantRow,
        status: 'enabled',
      });

      const result = await service.enable('variant-2');

      expect(result).toMatchObject({ skuId: 'variant-2', status: 'enabled' });
      expect(typeof result.price).toBe('number');
      expect(result.price).toBe(29.99);
    });
  });

  describe('disable', () => {
    it('throws NotFoundException when the target variant does not exist', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);

      await expect(service.disable('missing-sku')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the target variant is soft-deleted', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);

      await expect(service.disable('variant-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
    });

    it('disables an enabled variant', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);
      prisma.productVariant.update.mockResolvedValue({
        ...variantRow,
        status: 'disabled',
      });

      await expect(service.disable('variant-1')).resolves.not.toThrow();
      expect(prisma.productVariant.update).toHaveBeenCalled();
    });

    it('sets status to disabled in the update call', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);
      prisma.productVariant.update.mockResolvedValue({
        ...variantRow,
        status: 'disabled',
      });

      await service.disable('variant-1');

      const [args] = prisma.productVariant.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data).toMatchObject({ status: 'disabled' });
    });

    it('succeeds when disabling an already-disabled variant', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(disabledVariantRow);
      prisma.productVariant.update.mockResolvedValue(disabledVariantRow);

      await expect(service.disable('variant-2')).resolves.not.toThrow();

      const [args] = prisma.productVariant.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data).toMatchObject({ status: 'disabled' });
    });

    it('allows disabling a variant whose parent product is disabled', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);
      prisma.productVariant.update.mockResolvedValue({
        ...variantRow,
        status: 'disabled',
      });

      await expect(service.disable('variant-1')).resolves.not.toThrow();
      expect(prisma.productVariant.update).toHaveBeenCalled();
    });

    it('resolves a ProductVariantEntity reflecting the disabled row, with price normalized to a number', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variantRow);
      prisma.productVariant.update.mockResolvedValue({
        ...variantRow,
        status: 'disabled',
      });

      const result = await service.disable('variant-1');

      expect(result).toMatchObject({ skuId: 'variant-1', status: 'disabled' });
      expect(typeof result.price).toBe('number');
      expect(result.price).toBe(29.99);
    });
  });
});
