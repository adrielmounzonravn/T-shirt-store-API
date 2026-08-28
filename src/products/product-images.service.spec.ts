import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProductImagesService } from './product-images.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';

type ProductRow = {
  id: string;
  name: string;
  status: string;
  deletedAt: Date | null;
};

type ProductImageRow = {
  id: string;
  productId: string;
  imagePath: string;
  isCover: boolean;
  createdAt: Date;
};

type WhereArgs = { where?: Record<string, unknown> };
type CreateArgs = { data: Record<string, unknown> };
type UpdateArgs = {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
};
type TransactionArg = ((tx: unknown) => Promise<unknown>) | Promise<unknown>[];

function objectContaining<T extends Record<string, unknown>>(obj: T): T {
  return expect.objectContaining(obj as never) as T;
}

describe('ProductImagesService', () => {
  let service: ProductImagesService;
  let prisma: {
    product: {
      findFirst: ReturnType<
        typeof vi.fn<(args: WhereArgs) => Promise<ProductRow | null>>
      >;
    };
    productImage: {
      create: ReturnType<
        typeof vi.fn<(args: CreateArgs) => Promise<ProductImageRow>>
      >;
      update: ReturnType<
        typeof vi.fn<(args: UpdateArgs) => Promise<ProductImageRow>>
      >;
      updateMany: ReturnType<
        typeof vi.fn<(args: UpdateArgs) => Promise<{ count: number }>>
      >;
      findFirst: ReturnType<
        typeof vi.fn<(args: WhereArgs) => Promise<ProductImageRow | null>>
      >;
      findUnique: ReturnType<
        typeof vi.fn<(args: WhereArgs) => Promise<ProductImageRow | null>>
      >;
      delete: ReturnType<
        typeof vi.fn<(args: WhereArgs) => Promise<ProductImageRow>>
      >;
    };
    $transaction: ReturnType<
      typeof vi.fn<(arg: TransactionArg) => Promise<unknown>>
    >;
  };
  let storage: {
    buildObjectKey: ReturnType<
      typeof vi.fn<
        (
          prefix: string,
          entityId: string,
          generatedId: string,
          originalName: string,
          mimeType: string,
        ) => string
      >
    >;
    upload: ReturnType<
      typeof vi.fn<(key: string, file: Express.Multer.File) => Promise<void>>
    >;
    delete: ReturnType<typeof vi.fn<(key: string) => Promise<void>>>;
  };

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

  const imageRow = {
    id: 'image-1',
    productId: 'product-1',
    imagePath: 'products/product-1/image-1.jpg',
    isCover: false,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  };

  const coverImageRow = {
    ...imageRow,
    id: 'image-2',
    isCover: true,
  };

  const makeFile = (
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File =>
    ({
      fieldname: 'file',
      originalname: 'photo.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: Buffer.from('fake-image-data'),
      ...overrides,
    }) as Express.Multer.File;

  const setupService = async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ProductImagesService, PrismaService, StorageService],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(StorageService)
      .useValue(storage)
      .compile();

    return moduleRef.get(ProductImagesService);
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findFirst: vi.fn<(args: WhereArgs) => Promise<ProductRow | null>>(),
      },
      productImage: {
        create: vi.fn<(args: CreateArgs) => Promise<ProductImageRow>>(),
        update: vi.fn<(args: UpdateArgs) => Promise<ProductImageRow>>(),
        updateMany: vi.fn<(args: UpdateArgs) => Promise<{ count: number }>>(),
        findFirst:
          vi.fn<(args: WhereArgs) => Promise<ProductImageRow | null>>(),
        findUnique:
          vi.fn<(args: WhereArgs) => Promise<ProductImageRow | null>>(),
        delete: vi.fn<(args: WhereArgs) => Promise<ProductImageRow>>(),
      },
      $transaction: vi.fn<(arg: TransactionArg) => Promise<unknown>>(),
    };
    storage = {
      buildObjectKey:
        vi.fn<
          (
            prefix: string,
            entityId: string,
            generatedId: string,
            originalName: string,
            mimeType: string,
          ) => string
        >(),
      upload:
        vi.fn<(key: string, file: Express.Multer.File) => Promise<void>>(),
      delete: vi.fn<(key: string) => Promise<void>>(),
    };

    prisma.$transaction.mockImplementation((arg: TransactionArg) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    );
    prisma.product.findFirst.mockResolvedValue(null);
    prisma.productImage.findFirst.mockResolvedValue(null);
    prisma.productImage.findUnique.mockResolvedValue(null);
    prisma.productImage.updateMany.mockResolvedValue({ count: 0 });
    storage.buildObjectKey.mockReturnValue(
      'products/product-1/generated-id.jpg',
    );
    storage.upload.mockResolvedValue(undefined);
    storage.delete.mockResolvedValue(undefined);

    service = await setupService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('upload', () => {
    it('throws NotFoundException when the product does not exist', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.upload('missing-product', makeFile(), { isCover: false }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.productImage.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the product is soft-deleted', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.upload('product-1', makeFile(), { isCover: false }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.productImage.create).not.toHaveBeenCalled();
    });

    it('allows uploading to a disabled (but not deleted) product', async () => {
      prisma.product.findFirst.mockResolvedValue(disabledProductRow);
      prisma.productImage.create.mockResolvedValue(imageRow);

      await expect(
        service.upload('product-1', makeFile(), { isCover: false }),
      ).resolves.not.toThrow();
      expect(prisma.productImage.create).toHaveBeenCalled();
    });

    it('builds the object key via StorageService with the products prefix, the productId, a generated id, and the file metadata', async () => {
      prisma.product.findFirst.mockResolvedValue(enabledProductRow);
      prisma.productImage.create.mockResolvedValue(imageRow);
      const file = makeFile({
        originalname: 'photo.png',
        mimetype: 'image/png',
      });

      await service.upload('product-1', file, { isCover: false });

      expect(storage.buildObjectKey).toHaveBeenCalledWith(
        'products',
        'product-1',
        expect.any(String),
        'photo.png',
        'image/png',
      );
    });

    it('uploads the file to storage using the built key', async () => {
      prisma.product.findFirst.mockResolvedValue(enabledProductRow);
      prisma.productImage.create.mockResolvedValue(imageRow);
      storage.buildObjectKey.mockReturnValue('products/product-1/xyz.jpg');
      const file = makeFile();

      await service.upload('product-1', file, { isCover: false });

      expect(storage.upload).toHaveBeenCalledWith(
        'products/product-1/xyz.jpg',
        file,
      );
    });

    it('creates the ProductImage row with the same generated id used to build the key, the built key as imagePath, and the given productId', async () => {
      prisma.product.findFirst.mockResolvedValue(enabledProductRow);
      storage.buildObjectKey.mockReturnValue('products/product-1/xyz.jpg');
      prisma.productImage.create.mockResolvedValue({
        ...imageRow,
        imagePath: 'products/product-1/xyz.jpg',
      });

      await service.upload('product-1', makeFile(), { isCover: false });

      const [, , generatedId] = storage.buildObjectKey.mock.calls[0];
      const [args] = prisma.productImage.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data).toMatchObject({
        id: generatedId,
        productId: 'product-1',
        imagePath: 'products/product-1/xyz.jpg',
      });
    });

    it('does not send isCover: true to storage when it is omitted from the dto (relies on the false default)', async () => {
      prisma.product.findFirst.mockResolvedValue(enabledProductRow);
      prisma.productImage.create.mockResolvedValue(imageRow);

      const result = await service.upload(
        'product-1',
        makeFile(),
        {} as { isCover: boolean },
      );

      const [args] = prisma.productImage.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data.isCover).not.toBe(true);
      expect(prisma.productImage.updateMany).not.toHaveBeenCalled();
      expect(result.isCover).toBe(false);
    });

    it('creates the row with isCover: false when the dto explicitly says false', async () => {
      prisma.product.findFirst.mockResolvedValue(enabledProductRow);
      prisma.productImage.create.mockResolvedValue(imageRow);

      await service.upload('product-1', makeFile(), { isCover: false });

      const [args] = prisma.productImage.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data).toMatchObject({ isCover: false });
    });

    it('creates the row with isCover: true when the dto says true', async () => {
      prisma.product.findFirst.mockResolvedValue(enabledProductRow);
      prisma.productImage.create.mockResolvedValue(coverImageRow);

      await service.upload('product-1', makeFile(), { isCover: true });

      const [args] = prisma.productImage.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data).toMatchObject({ isCover: true });
    });

    it('does not unset any other cover images when isCover is false', async () => {
      prisma.product.findFirst.mockResolvedValue(enabledProductRow);
      prisma.productImage.create.mockResolvedValue(imageRow);

      await service.upload('product-1', makeFile(), { isCover: false });

      expect(prisma.productImage.updateMany).not.toHaveBeenCalled();
    });

    it('does not unset any other cover images when isCover is omitted', async () => {
      prisma.product.findFirst.mockResolvedValue(enabledProductRow);
      prisma.productImage.create.mockResolvedValue(imageRow);

      await service.upload('product-1', makeFile(), {} as { isCover: boolean });

      expect(prisma.productImage.updateMany).not.toHaveBeenCalled();
    });

    it('unsets other cover images for the same product when isCover is true', async () => {
      prisma.product.findFirst.mockResolvedValue(enabledProductRow);
      prisma.productImage.create.mockResolvedValue(coverImageRow);

      await service.upload('product-1', makeFile(), { isCover: true });

      const [args] = prisma.productImage.updateMany.mock.calls[0] as [
        { where?: Record<string, unknown>; data?: Record<string, unknown> },
      ];
      expect(args.where).toMatchObject({ productId: 'product-1' });
      expect(args.data).toMatchObject({ isCover: false });
    });

    it('returns a ProductImageEntity matching the created row', async () => {
      prisma.product.findFirst.mockResolvedValue(enabledProductRow);
      prisma.productImage.create.mockResolvedValue(coverImageRow);

      const result = await service.upload('product-1', makeFile(), {
        isCover: true,
      });

      expect(result).toMatchObject({
        id: 'image-2',
        productId: 'product-1',
        imagePath: coverImageRow.imagePath,
        isCover: true,
      });
    });
  });

  describe('setCover', () => {
    it('throws NotFoundException when no ProductImage with that id exists', async () => {
      prisma.productImage.findFirst.mockResolvedValue(null);
      prisma.productImage.findUnique.mockResolvedValue(null);

      await expect(
        service.setCover('missing-image', { isCover: true }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.productImage.update).not.toHaveBeenCalled();
    });

    it('unsets isCover on other images belonging to the same product', async () => {
      prisma.productImage.findFirst.mockResolvedValue(imageRow);
      prisma.productImage.findUnique.mockResolvedValue(imageRow);
      prisma.productImage.update.mockResolvedValue({
        ...imageRow,
        isCover: true,
      });

      await service.setCover('image-1', { isCover: true });

      expect(prisma.productImage.updateMany).toHaveBeenCalledWith(
        objectContaining({
          where: objectContaining({ productId: 'product-1' }),
          data: objectContaining({ isCover: false }),
        }),
      );
    });

    it('does not unset cover images belonging to other products', async () => {
      prisma.productImage.findFirst.mockResolvedValue(imageRow);
      prisma.productImage.findUnique.mockResolvedValue(imageRow);
      prisma.productImage.update.mockResolvedValue({
        ...imageRow,
        isCover: true,
      });

      await service.setCover('image-1', { isCover: true });

      const calls = prisma.productImage.updateMany.mock.calls as [
        { where?: Record<string, unknown> },
      ][];
      for (const [args] of calls) {
        expect(args.where).toMatchObject({ productId: 'product-1' });
      }
    });

    it('sets isCover to true on the target image', async () => {
      prisma.productImage.findFirst.mockResolvedValue(imageRow);
      prisma.productImage.findUnique.mockResolvedValue(imageRow);
      prisma.productImage.update.mockResolvedValue({
        ...imageRow,
        isCover: true,
      });

      await service.setCover('image-1', { isCover: true });

      const [args] = prisma.productImage.update.mock.calls[0] as [
        { where?: Record<string, unknown>; data?: Record<string, unknown> },
      ];
      expect(args.where).toMatchObject({ id: 'image-1' });
      expect(args.data).toMatchObject({ isCover: true });
    });

    it('returns the updated ProductImageEntity reflecting isCover: true', async () => {
      prisma.productImage.findFirst.mockResolvedValue(imageRow);
      prisma.productImage.findUnique.mockResolvedValue(imageRow);
      prisma.productImage.update.mockResolvedValue({
        ...imageRow,
        isCover: true,
      });

      const result = await service.setCover('image-1', { isCover: true });

      expect(result).toMatchObject({ id: 'image-1', isCover: true });
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when no such image exists', async () => {
      prisma.productImage.findFirst.mockResolvedValue(null);
      prisma.productImage.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing-image')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.productImage.delete).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('calls StorageService.delete with the image imagePath', async () => {
      prisma.productImage.findFirst.mockResolvedValue(imageRow);
      prisma.productImage.findUnique.mockResolvedValue(imageRow);
      prisma.productImage.delete.mockResolvedValue(imageRow);

      await service.remove('image-1');

      expect(storage.delete).toHaveBeenCalledWith(imageRow.imagePath);
    });

    it('deletes the ProductImage row after removing it from storage', async () => {
      prisma.productImage.findFirst.mockResolvedValue(imageRow);
      prisma.productImage.findUnique.mockResolvedValue(imageRow);
      prisma.productImage.delete.mockResolvedValue(imageRow);

      await service.remove('image-1');

      const [args] = prisma.productImage.delete.mock.calls[0] as [
        { where?: Record<string, unknown> },
      ];
      expect(args.where).toMatchObject({ id: 'image-1' });
    });

    it('resolves undefined on success', async () => {
      prisma.productImage.findFirst.mockResolvedValue(imageRow);
      prisma.productImage.findUnique.mockResolvedValue(imageRow);
      prisma.productImage.delete.mockResolvedValue(imageRow);

      const result = await service.remove('image-1');

      expect(result).toBeUndefined();
    });
  });
});
