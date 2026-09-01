import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import {
  StockNotificationService,
  type StockNotificationJobData,
} from './stock-notification.service.js';
import {
  STOCK_NOTIFICATION_QUEUE,
  STOCK_NOTIFICATION_JOB,
} from './stock-notification.constants.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { StorageService } from '../storage/storage.service.js';

describe('StockNotificationService', () => {
  let service: StockNotificationService;
  let queue: { add: ReturnType<typeof vi.fn> };
  let prisma: {
    productVariant: { findUniqueOrThrow: ReturnType<typeof vi.fn> };
    product: { findUniqueOrThrow: ReturnType<typeof vi.fn> };
    likedProduct: { findMany: ReturnType<typeof vi.fn> };
  };
  let mail: { sendLowStockNotificationEmail: ReturnType<typeof vi.fn> };
  let storage: { getPublicUrl: ReturnType<typeof vi.fn> };

  const skuId = 'sku-1';
  const productId = 'product-1';

  beforeEach(async () => {
    queue = { add: vi.fn().mockResolvedValue(undefined) };
    prisma = {
      productVariant: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ productId }),
      },
      product: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          name: 'Classic Tee',
          images: [],
        }),
      },
      likedProduct: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    mail = {
      sendLowStockNotificationEmail: vi.fn().mockResolvedValue(undefined),
    };
    storage = {
      getPublicUrl: vi
        .fn()
        .mockReturnValue('https://cdn.example.com/cover.jpg'),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        StockNotificationService,
        PrismaService,
        MailService,
        StorageService,
        { provide: getQueueToken(STOCK_NOTIFICATION_QUEUE), useValue: queue },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(MailService)
      .useValue(mail)
      .overrideProvider(StorageService)
      .useValue(storage)
      .compile();

    service = moduleRef.get(StockNotificationService);
  });

  describe('enqueueLowStockNotification', () => {
    it('adds a job to the queue with the sku id', async () => {
      await service.enqueueLowStockNotification(skuId);

      expect(queue.add).toHaveBeenCalledWith(STOCK_NOTIFICATION_JOB, {
        skuId,
      } satisfies StockNotificationJobData);
    });
  });

  describe('notifyLikersOfLowStock', () => {
    it('looks up the variant to resolve the productId, then the product', async () => {
      await service.notifyLikersOfLowStock(skuId);

      expect(prisma.productVariant.findUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: skuId } }),
      );
      expect(prisma.product.findUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: productId } }),
      );
    });

    it('sends an email to every liker who has not purchased', async () => {
      prisma.likedProduct.findMany.mockResolvedValue([
        { user: { email: 'alice@example.com' } },
        { user: { email: 'bob@example.com' } },
      ]);

      await service.notifyLikersOfLowStock(skuId);

      expect(mail.sendLowStockNotificationEmail).toHaveBeenCalledTimes(2);
      expect(mail.sendLowStockNotificationEmail).toHaveBeenCalledWith(
        'alice@example.com',
        'Classic Tee',
        undefined,
      );
      expect(mail.sendLowStockNotificationEmail).toHaveBeenCalledWith(
        'bob@example.com',
        'Classic Tee',
        undefined,
      );
    });

    it('builds the image URL from the cover image path and passes it to the mail call', async () => {
      prisma.product.findUniqueOrThrow.mockResolvedValue({
        name: 'Classic Tee',
        images: [{ imagePath: 'products/product-1/cover.jpg', isCover: true }],
      });
      prisma.likedProduct.findMany.mockResolvedValue([
        { user: { email: 'alice@example.com' } },
      ]);
      storage.getPublicUrl.mockReturnValue(
        'https://cdn.example.com/products/product-1/cover.jpg',
      );

      await service.notifyLikersOfLowStock(skuId);

      expect(storage.getPublicUrl).toHaveBeenCalledWith(
        'products/product-1/cover.jpg',
      );
      expect(mail.sendLowStockNotificationEmail).toHaveBeenCalledWith(
        'alice@example.com',
        'Classic Tee',
        'https://cdn.example.com/products/product-1/cover.jpg',
      );
    });

    it('passes undefined as the image URL and never calls storage when there is no cover image', async () => {
      prisma.product.findUniqueOrThrow.mockResolvedValue({
        name: 'Classic Tee',
        images: [],
      });
      prisma.likedProduct.findMany.mockResolvedValue([
        { user: { email: 'alice@example.com' } },
      ]);

      await service.notifyLikersOfLowStock(skuId);

      expect(storage.getPublicUrl).not.toHaveBeenCalled();
      expect(mail.sendLowStockNotificationEmail).toHaveBeenCalledWith(
        'alice@example.com',
        'Classic Tee',
        undefined,
      );
    });

    it('sends no emails when there are no likers', async () => {
      prisma.likedProduct.findMany.mockResolvedValue([]);

      await service.notifyLikersOfLowStock(skuId);

      expect(mail.sendLowStockNotificationEmail).not.toHaveBeenCalled();
    });

    it('queries likedProduct with a filter matching the productId and excluding purchasers', async () => {
      await service.notifyLikersOfLowStock(skuId);

      expect(prisma.likedProduct.findMany).toHaveBeenCalledTimes(1);
      const [args] = prisma.likedProduct.findMany.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(args.where).toEqual(expect.objectContaining({ productId }));

      const whereJson = JSON.stringify(args.where);
      expect(whereJson).toContain('cartNumbers');
      expect(whereJson).toContain('cartProducts');
      expect(whereJson).toContain('pending');
      expect(whereJson).toContain('cancelled');
    });

    it('emails every returned liker regardless of how the exclusion filter was shaped, given curated rows simulating non-purchasers only', async () => {
      prisma.likedProduct.findMany.mockResolvedValue([
        { user: { email: 'carol@example.com' } },
        { user: { email: 'dave@example.com' } },
        { user: { email: 'erin@example.com' } },
      ]);

      await service.notifyLikersOfLowStock(skuId);

      expect(mail.sendLowStockNotificationEmail).toHaveBeenCalledTimes(3);
      for (const email of [
        'carol@example.com',
        'dave@example.com',
        'erin@example.com',
      ]) {
        expect(mail.sendLowStockNotificationEmail).toHaveBeenCalledWith(
          email,
          'Classic Tee',
          undefined,
        );
      }
    });
  });
});
