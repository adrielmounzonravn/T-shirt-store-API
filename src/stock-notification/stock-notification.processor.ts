import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { STOCK_NOTIFICATION_QUEUE } from './stock-notification.constants.js';
import {
  StockNotificationService,
  type StockNotificationJobData,
} from './stock-notification.service.js';

@Processor(STOCK_NOTIFICATION_QUEUE)
export class StockNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(StockNotificationProcessor.name);

  constructor(
    private readonly stockNotificationService: StockNotificationService,
  ) {
    super();
  }

  async process(job: Job<StockNotificationJobData>): Promise<void> {
    await this.stockNotificationService.notifyLikersOfLowStock(job.data.skuId);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<StockNotificationJobData>, error: Error): void {
    this.logger.error(
      `Stock notification job ${job.id} failed for SKU ${job.data.skuId}`,
      error.stack,
    );
  }
}
