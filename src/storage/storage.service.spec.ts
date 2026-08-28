import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { StorageService } from './storage.service.js';

describe('StorageService', () => {
  const setupService = async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [StorageService],
    }).compile();

    return moduleRef.get(StorageService);
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

  describe('buildObjectKey', () => {
    it('builds the key as prefix/parentId/imageId.ext', async () => {
      const service = await setupService();

      const key = service.buildObjectKey(
        'products',
        'product-1',
        'image-1',
        'photo.jpg',
        'image/jpeg',
      );

      expect(key).toBe('products/product-1/image-1.jpg');
    });

    it('uses the variants prefix when given', async () => {
      const service = await setupService();

      const key = service.buildObjectKey(
        'variants',
        'variant-1',
        'image-2',
        'photo.png',
        'image/png',
      );

      expect(key).toBe('variants/variant-1/image-2.png');
    });

    it('lowercases an uppercase extension', async () => {
      const service = await setupService();

      const key = service.buildObjectKey(
        'products',
        'product-1',
        'image-1',
        'PHOTO.JPG',
        'image/jpeg',
      );

      expect(key).toBe('products/product-1/image-1.jpg');
    });

    it('lowercases a mixed-case extension', async () => {
      const service = await setupService();

      const key = service.buildObjectKey(
        'products',
        'product-1',
        'image-1',
        'photo.JpEg',
        'image/jpeg',
      );

      expect(key).toBe('products/product-1/image-1.jpeg');
    });

    it('uses the extension of the original filename, ignoring the mimetype, when both are present', async () => {
      const service = await setupService();

      const key = service.buildObjectKey(
        'products',
        'product-1',
        'image-1',
        'photo.png',
        'image/jpeg',
      );

      expect(key).toBe('products/product-1/image-1.png');
    });

    it('handles a filename with multiple dots by using the last segment as the extension', async () => {
      const service = await setupService();

      const key = service.buildObjectKey(
        'products',
        'product-1',
        'image-1',
        'my.photo.archive.jpg',
        'image/jpeg',
      );

      expect(key).toBe('products/product-1/image-1.jpg');
    });

    it('falls back to the mimetype mapping when the filename has no dot at all', async () => {
      const service = await setupService();

      const key = service.buildObjectKey(
        'products',
        'product-1',
        'image-1',
        'noext',
        'image/jpeg',
      );

      expect(key).toBe('products/product-1/image-1.jpg');
    });

    it('falls back to the mimetype mapping when the filename ends with a trailing dot and nothing after it', async () => {
      const service = await setupService();

      const key = service.buildObjectKey(
        'products',
        'product-1',
        'image-1',
        'trailing.',
        'image/jpeg',
      );

      expect(key).toBe('products/product-1/image-1.jpg');
    });

    it('maps image/png to png when falling back to mimetype', async () => {
      const service = await setupService();

      const key = service.buildObjectKey(
        'products',
        'product-1',
        'image-1',
        'noext',
        'image/png',
      );

      expect(key).toBe('products/product-1/image-1.png');
    });

    it('maps image/webp to webp when falling back to mimetype', async () => {
      const service = await setupService();

      const key = service.buildObjectKey(
        'products',
        'product-1',
        'image-1',
        'noext',
        'image/webp',
      );

      expect(key).toBe('products/product-1/image-1.webp');
    });

    it('falls back to bin when neither the filename nor a recognized mimetype provide an extension', async () => {
      const service = await setupService();

      const key = service.buildObjectKey(
        'products',
        'product-1',
        'image-1',
        'noext',
        'application/octet-stream',
      );

      expect(key).toBe('products/product-1/image-1.bin');
    });

    it('falls back to bin for a trailing-dot filename with an unrecognized mimetype', async () => {
      const service = await setupService();

      const key = service.buildObjectKey(
        'products',
        'product-1',
        'image-1',
        'trailing.',
        'application/pdf',
      );

      expect(key).toBe('products/product-1/image-1.bin');
    });
  });

  describe('upload', () => {
    it('resolves without throwing', async () => {
      const service = await setupService();

      await expect(
        service.upload('products/product-1/image-1.jpg', makeFile()),
      ).resolves.not.toThrow();
    });
  });

  describe('delete', () => {
    it('resolves without throwing', async () => {
      const service = await setupService();

      await expect(
        service.delete('products/product-1/image-1.jpg'),
      ).resolves.not.toThrow();
    });
  });
});
