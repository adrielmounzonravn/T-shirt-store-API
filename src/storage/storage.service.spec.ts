import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { StorageService } from './storage.service.js';
import { S3_CLIENT } from './s3-client.provider.js';

describe('StorageService', () => {
  const BUCKET = 'test-bucket';

  let s3: { send: ReturnType<typeof vi.fn> };
  let config: { get: ReturnType<typeof vi.fn> };

  const setupService = async () => {
    s3 = { send: vi.fn() };
    config = {
      get: vi.fn((key: string) => {
        const values: Record<string, string> = {
          's3.bucket': BUCKET,
          's3.region': 'us-east-1',
          's3.accessKeyId': 'test-access-key',
          's3.secretAccessKey': 'test-secret-key',
        };
        return values[key];
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: S3_CLIENT, useValue: s3 },
        { provide: ConfigService, useValue: config },
      ],
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
    it('sends a PutObjectCommand with the bucket, key, body, and content type', async () => {
      const service = await setupService();
      s3.send.mockResolvedValue({});
      const file = makeFile({
        buffer: Buffer.from('binary-data'),
        mimetype: 'image/png',
      });

      await service.upload('products/product-1/image-1.png', file);

      expect(s3.send).toHaveBeenCalledTimes(1);
      const command = s3.send.mock.calls[0][0] as PutObjectCommand;
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toEqual(
        expect.objectContaining({
          Bucket: BUCKET,
          Key: 'products/product-1/image-1.png',
          Body: file.buffer,
          ContentType: 'image/png',
        }),
      );
    });

    it('resolves when the S3 client resolves', async () => {
      const service = await setupService();
      s3.send.mockResolvedValue({});

      await expect(
        service.upload('products/product-1/image-1.jpg', makeFile()),
      ).resolves.toBeUndefined();
    });

    it('propagates the error when the S3 client rejects', async () => {
      const service = await setupService();
      const error = new Error('S3 upload failed');
      s3.send.mockRejectedValue(error);

      await expect(
        service.upload('products/product-1/image-1.jpg', makeFile()),
      ).rejects.toThrow('S3 upload failed');
    });
  });

  describe('delete', () => {
    it('sends a DeleteObjectCommand with the bucket and key', async () => {
      const service = await setupService();
      s3.send.mockResolvedValue({});

      await service.delete('products/product-1/image-1.jpg');

      expect(s3.send).toHaveBeenCalledTimes(1);
      const command = s3.send.mock.calls[0][0] as DeleteObjectCommand;
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input).toEqual(
        expect.objectContaining({
          Bucket: BUCKET,
          Key: 'products/product-1/image-1.jpg',
        }),
      );
    });

    it('resolves when the S3 client resolves', async () => {
      const service = await setupService();
      s3.send.mockResolvedValue({});

      await expect(
        service.delete('products/product-1/image-1.jpg'),
      ).resolves.toBeUndefined();
    });

    it('propagates the error when the S3 client rejects', async () => {
      const service = await setupService();
      const error = new Error('S3 delete failed');
      s3.send.mockRejectedValue(error);

      await expect(
        service.delete('products/product-1/image-1.jpg'),
      ).rejects.toThrow('S3 delete failed');
    });
  });
});
