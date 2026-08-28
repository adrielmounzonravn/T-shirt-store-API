import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { VariantImagesService } from './variant-images.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';

type VariantRow = {
  id: string;
  productId: string;
  status: string;
  deletedAt: Date | null;
};

type VariantImageRow = {
  id: string;
  skuId: string;
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

describe('VariantImagesService', () => {
  let service: VariantImagesService;
  let prisma: {
    productVariant: {
      findFirst: ReturnType<
        typeof vi.fn<(args: WhereArgs) => Promise<VariantRow | null>>
      >;
    };
    variantImage: {
      create: ReturnType<
        typeof vi.fn<(args: CreateArgs) => Promise<VariantImageRow>>
      >;
      update: ReturnType<
        typeof vi.fn<(args: UpdateArgs) => Promise<VariantImageRow>>
      >;
      updateMany: ReturnType<
        typeof vi.fn<(args: UpdateArgs) => Promise<{ count: number }>>
      >;
      findFirst: ReturnType<
        typeof vi.fn<(args: WhereArgs) => Promise<VariantImageRow | null>>
      >;
      findUnique: ReturnType<
        typeof vi.fn<(args: WhereArgs) => Promise<VariantImageRow | null>>
      >;
      delete: ReturnType<
        typeof vi.fn<(args: WhereArgs) => Promise<VariantImageRow>>
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
          mimeType: string,
        ) => string
      >
    >;
    upload: ReturnType<
      typeof vi.fn<(key: string, file: Express.Multer.File) => Promise<void>>
    >;
    delete: ReturnType<typeof vi.fn<(key: string) => Promise<void>>>;
  };

  const enabledVariantRow = {
    id: 'variant-1',
    productId: 'product-1',
    status: 'enabled',
    deletedAt: null,
  };

  const disabledVariantRow = {
    ...enabledVariantRow,
    status: 'disabled',
  };

  const imageRow = {
    id: 'image-1',
    skuId: 'variant-1',
    imagePath: 'variants/variant-1/image-1.jpg',
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
      providers: [VariantImagesService, PrismaService, StorageService],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(StorageService)
      .useValue(storage)
      .compile();

    return moduleRef.get(VariantImagesService);
  };

  beforeEach(async () => {
    prisma = {
      productVariant: {
        findFirst: vi.fn<(args: WhereArgs) => Promise<VariantRow | null>>(),
      },
      variantImage: {
        create: vi.fn<(args: CreateArgs) => Promise<VariantImageRow>>(),
        update: vi.fn<(args: UpdateArgs) => Promise<VariantImageRow>>(),
        updateMany: vi.fn<(args: UpdateArgs) => Promise<{ count: number }>>(),
        findFirst:
          vi.fn<(args: WhereArgs) => Promise<VariantImageRow | null>>(),
        findUnique:
          vi.fn<(args: WhereArgs) => Promise<VariantImageRow | null>>(),
        delete: vi.fn<(args: WhereArgs) => Promise<VariantImageRow>>(),
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
    prisma.productVariant.findFirst.mockResolvedValue(null);
    prisma.variantImage.findFirst.mockResolvedValue(null);
    prisma.variantImage.findUnique.mockResolvedValue(null);
    prisma.variantImage.updateMany.mockResolvedValue({ count: 0 });
    storage.buildObjectKey.mockReturnValue(
      'variants/variant-1/generated-id.jpg',
    );
    storage.upload.mockResolvedValue(undefined);
    storage.delete.mockResolvedValue(undefined);

    service = await setupService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('upload', () => {
    it('throws NotFoundException when the variant does not exist', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);

      await expect(
        service.upload('missing-variant', makeFile(), { isCover: false }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.variantImage.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the variant is soft-deleted', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);

      await expect(
        service.upload('variant-1', makeFile(), { isCover: false }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.variantImage.create).not.toHaveBeenCalled();
    });

    it('allows uploading to a disabled (but not deleted) variant', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(disabledVariantRow);
      prisma.variantImage.create.mockResolvedValue(imageRow);

      await expect(
        service.upload('variant-1', makeFile(), { isCover: false }),
      ).resolves.not.toThrow();
      expect(prisma.variantImage.create).toHaveBeenCalled();
    });

    it('builds the object key via StorageService with the variants prefix, the skuId, a generated id, and the file metadata', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(enabledVariantRow);
      prisma.variantImage.create.mockResolvedValue(imageRow);
      const file = makeFile({
        originalname: 'photo.png',
        mimetype: 'image/png',
      });

      await service.upload('variant-1', file, { isCover: false });

      expect(storage.buildObjectKey).toHaveBeenCalledWith(
        'variants',
        'variant-1',
        expect.any(String),
        'image/png',
      );
    });

    it('uploads the file to storage using the built key', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(enabledVariantRow);
      prisma.variantImage.create.mockResolvedValue(imageRow);
      storage.buildObjectKey.mockReturnValue('variants/variant-1/xyz.jpg');
      const file = makeFile();

      await service.upload('variant-1', file, { isCover: false });

      expect(storage.upload).toHaveBeenCalledWith(
        'variants/variant-1/xyz.jpg',
        file,
      );
    });

    it('creates the VariantImage row with the same generated id used to build the key, the built key as imagePath, and the given skuId', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(enabledVariantRow);
      storage.buildObjectKey.mockReturnValue('variants/variant-1/xyz.jpg');
      prisma.variantImage.create.mockResolvedValue({
        ...imageRow,
        imagePath: 'variants/variant-1/xyz.jpg',
      });

      await service.upload('variant-1', makeFile(), { isCover: false });

      const [, , generatedId] = storage.buildObjectKey.mock.calls[0];
      const [args] = prisma.variantImage.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data).toMatchObject({
        id: generatedId,
        skuId: 'variant-1',
        imagePath: 'variants/variant-1/xyz.jpg',
      });
    });

    it('does not send isCover: true to storage when it is omitted from the dto (relies on the false default)', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(enabledVariantRow);
      prisma.variantImage.create.mockResolvedValue(imageRow);

      const result = await service.upload(
        'variant-1',
        makeFile(),
        {} as { isCover: boolean },
      );

      const [args] = prisma.variantImage.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data.isCover).not.toBe(true);
      expect(prisma.variantImage.updateMany).not.toHaveBeenCalled();
      expect(result.isCover).toBe(false);
    });

    it('creates the row with isCover: false when the dto explicitly says false', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(enabledVariantRow);
      prisma.variantImage.create.mockResolvedValue(imageRow);

      await service.upload('variant-1', makeFile(), { isCover: false });

      const [args] = prisma.variantImage.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data).toMatchObject({ isCover: false });
    });

    it('creates the row with isCover: true when the dto says true', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(enabledVariantRow);
      prisma.variantImage.create.mockResolvedValue(coverImageRow);

      await service.upload('variant-1', makeFile(), { isCover: true });

      const [args] = prisma.variantImage.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data).toMatchObject({ isCover: true });
    });

    it('does not unset any other cover images when isCover is false', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(enabledVariantRow);
      prisma.variantImage.create.mockResolvedValue(imageRow);

      await service.upload('variant-1', makeFile(), { isCover: false });

      expect(prisma.variantImage.updateMany).not.toHaveBeenCalled();
    });

    it('does not unset any other cover images when isCover is omitted', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(enabledVariantRow);
      prisma.variantImage.create.mockResolvedValue(imageRow);

      await service.upload('variant-1', makeFile(), {} as { isCover: boolean });

      expect(prisma.variantImage.updateMany).not.toHaveBeenCalled();
    });

    it('unsets other cover images for the same variant when isCover is true', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(enabledVariantRow);
      prisma.variantImage.create.mockResolvedValue(coverImageRow);

      await service.upload('variant-1', makeFile(), { isCover: true });

      expect(prisma.variantImage.updateMany).toHaveBeenCalledWith(
        objectContaining({
          where: objectContaining({ skuId: 'variant-1' }),
          data: objectContaining({ isCover: false }),
        }),
      );
    });

    it('returns a VariantImageEntity matching the created row', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(enabledVariantRow);
      prisma.variantImage.create.mockResolvedValue(coverImageRow);

      const result = await service.upload('variant-1', makeFile(), {
        isCover: true,
      });

      expect(result).toMatchObject({
        imageId: 'image-2',
        skuId: 'variant-1',
        imagePath: coverImageRow.imagePath,
        isCover: true,
      });
    });

    it('deletes the uploaded object from storage and rethrows when the DB transaction fails', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(enabledVariantRow);
      storage.buildObjectKey.mockReturnValue('variants/variant-1/xyz.jpg');
      const dbError = new Error('transaction failed');
      prisma.$transaction.mockRejectedValue(dbError);

      await expect(
        service.upload('variant-1', makeFile(), { isCover: false }),
      ).rejects.toThrow(dbError);
      expect(storage.delete).toHaveBeenCalledWith('variants/variant-1/xyz.jpg');
    });

    it('still rethrows the original transaction error when the compensating storage delete also fails', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(enabledVariantRow);
      const dbError = new Error('transaction failed');
      prisma.$transaction.mockRejectedValue(dbError);
      storage.delete.mockRejectedValue(new Error('storage delete failed'));

      await expect(
        service.upload('variant-1', makeFile(), { isCover: false }),
      ).rejects.toThrow(dbError);
    });
  });

  describe('setCover', () => {
    it('throws NotFoundException when no VariantImage with that id exists', async () => {
      prisma.variantImage.findFirst.mockResolvedValue(null);
      prisma.variantImage.findUnique.mockResolvedValue(null);

      await expect(
        service.setCover('missing-image', { isCover: true }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.variantImage.update).not.toHaveBeenCalled();
    });

    it('unsets isCover on other images belonging to the same variant', async () => {
      prisma.variantImage.findFirst.mockResolvedValue(imageRow);
      prisma.variantImage.findUnique.mockResolvedValue(imageRow);
      prisma.variantImage.update.mockResolvedValue({
        ...imageRow,
        isCover: true,
      });

      await service.setCover('image-1', { isCover: true });

      expect(prisma.variantImage.updateMany).toHaveBeenCalledWith(
        objectContaining({
          where: objectContaining({ skuId: 'variant-1' }),
          data: objectContaining({ isCover: false }),
        }),
      );
    });

    it('does not unset cover images belonging to other variants', async () => {
      prisma.variantImage.findFirst.mockResolvedValue(imageRow);
      prisma.variantImage.findUnique.mockResolvedValue(imageRow);
      prisma.variantImage.update.mockResolvedValue({
        ...imageRow,
        isCover: true,
      });

      await service.setCover('image-1', { isCover: true });

      const calls = prisma.variantImage.updateMany.mock.calls as [
        { where?: Record<string, unknown> },
      ][];
      for (const [args] of calls) {
        expect(args.where).toMatchObject({ skuId: 'variant-1' });
      }
    });

    it('sets isCover to true on the target image', async () => {
      prisma.variantImage.findFirst.mockResolvedValue(imageRow);
      prisma.variantImage.findUnique.mockResolvedValue(imageRow);
      prisma.variantImage.update.mockResolvedValue({
        ...imageRow,
        isCover: true,
      });

      await service.setCover('image-1', { isCover: true });

      const [args] = prisma.variantImage.update.mock.calls[0] as [
        { where?: Record<string, unknown>; data?: Record<string, unknown> },
      ];
      expect(args.where).toMatchObject({ id: 'image-1' });
      expect(args.data).toMatchObject({ isCover: true });
    });

    it('returns the updated VariantImageEntity reflecting isCover: true', async () => {
      prisma.variantImage.findFirst.mockResolvedValue(imageRow);
      prisma.variantImage.findUnique.mockResolvedValue(imageRow);
      prisma.variantImage.update.mockResolvedValue({
        ...imageRow,
        isCover: true,
      });

      const result = await service.setCover('image-1', { isCover: true });

      expect(result).toMatchObject({ imageId: 'image-1', isCover: true });
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when no such image exists', async () => {
      prisma.variantImage.findFirst.mockResolvedValue(null);
      prisma.variantImage.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing-image')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.variantImage.delete).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('calls StorageService.delete with the image imagePath', async () => {
      prisma.variantImage.findFirst.mockResolvedValue(imageRow);
      prisma.variantImage.findUnique.mockResolvedValue(imageRow);
      prisma.variantImage.delete.mockResolvedValue(imageRow);

      await service.remove('image-1');

      expect(storage.delete).toHaveBeenCalledWith(imageRow.imagePath);
    });

    it('deletes the VariantImage row after removing it from storage', async () => {
      prisma.variantImage.findFirst.mockResolvedValue(imageRow);
      prisma.variantImage.findUnique.mockResolvedValue(imageRow);
      prisma.variantImage.delete.mockResolvedValue(imageRow);

      await service.remove('image-1');

      const [args] = prisma.variantImage.delete.mock.calls[0] as [
        { where?: Record<string, unknown> },
      ];
      expect(args.where).toMatchObject({ id: 'image-1' });
    });

    it('resolves undefined on success', async () => {
      prisma.variantImage.findFirst.mockResolvedValue(imageRow);
      prisma.variantImage.findUnique.mockResolvedValue(imageRow);
      prisma.variantImage.delete.mockResolvedValue(imageRow);

      const result = await service.remove('image-1');

      expect(result).toBeUndefined();
    });

    it('deletes the VariantImage row before deleting the object from storage', async () => {
      prisma.variantImage.findFirst.mockResolvedValue(imageRow);
      prisma.variantImage.findUnique.mockResolvedValue(imageRow);
      prisma.variantImage.delete.mockResolvedValue(imageRow);

      await service.remove('image-1');

      const dbDeleteOrder =
        prisma.variantImage.delete.mock.invocationCallOrder[0];
      const storageDeleteOrder = storage.delete.mock.invocationCallOrder[0];
      expect(dbDeleteOrder).toBeLessThan(storageDeleteOrder);
    });

    it('does not delete from storage when deleting the VariantImage row fails', async () => {
      prisma.variantImage.findFirst.mockResolvedValue(imageRow);
      prisma.variantImage.findUnique.mockResolvedValue(imageRow);
      prisma.variantImage.delete.mockRejectedValueOnce(new Error('db error'));

      await expect(service.remove('image-1')).rejects.toThrow('db error');
      expect(storage.delete).not.toHaveBeenCalled();
    });
  });
});
