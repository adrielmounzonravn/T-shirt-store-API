import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { StockNotificationProcessor } from './stock-notification.processor.js';
import {
  StockNotificationService,
  type StockNotificationJobData,
} from './stock-notification.service.js';

describe('StockNotificationProcessor', () => {
  let processor: StockNotificationProcessor;
  let stockNotificationService: {
    notifyLikersOfLowStock: ReturnType<typeof vi.fn>;
  };

  const makeJob = (
    overrides: Partial<Job<StockNotificationJobData>> = {},
  ): Job<StockNotificationJobData> =>
    ({
      id: 'job-1',
      data: { skuId: 'sku-1' },
      ...overrides,
    }) as Job<StockNotificationJobData>;

  beforeEach(async () => {
    stockNotificationService = {
      notifyLikersOfLowStock: vi.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [StockNotificationProcessor, StockNotificationService],
    })
      .overrideProvider(StockNotificationService)
      .useValue(stockNotificationService)
      .compile();

    processor = moduleRef.get(StockNotificationProcessor);
  });

  describe('process', () => {
    it('awaits notifyLikersOfLowStock with the job skuId', async () => {
      const job = makeJob({ data: { skuId: 'sku-42' } });

      await processor.process(job);

      expect(
        stockNotificationService.notifyLikersOfLowStock,
      ).toHaveBeenCalledWith('sku-42');
    });

    it('propagates the error when notifyLikersOfLowStock rejects', async () => {
      const job = makeJob();
      const error = new Error('database unreachable');
      stockNotificationService.notifyLikersOfLowStock.mockRejectedValue(error);

      await expect(processor.process(job)).rejects.toThrow(error);
    });
  });

  describe('onFailed', () => {
    it('logs the failure without throwing', () => {
      const job = makeJob();
      const error = new Error('mail server timeout');

      expect(() => processor.onFailed(job, error)).not.toThrow();
    });

    it('does not call the notification service again', () => {
      const job = makeJob();
      const error = new Error('mail server timeout');

      processor.onFailed(job, error);

      expect(
        stockNotificationService.notifyLikersOfLowStock,
      ).not.toHaveBeenCalled();
    });
  });
});
