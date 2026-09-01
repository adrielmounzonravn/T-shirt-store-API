import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailModule } from '../mail/mail.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { STOCK_NOTIFICATION_QUEUE } from './stock-notification.constants.js';
import { StockNotificationProcessor } from './stock-notification.processor.js';
import { StockNotificationService } from './stock-notification.service.js';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    StorageModule,
    BullModule.registerQueueAsync({
      name: STOCK_NOTIFICATION_QUEUE,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        defaultJobOptions: {
          attempts: config.getOrThrow<number>('queue.jobAttempts'),
          backoff: {
            type: 'exponential',
            delay: config.getOrThrow<number>('queue.jobBackoffDelayMs'),
          },
        },
      }),
    }),
  ],
  providers: [StockNotificationService, StockNotificationProcessor],
  exports: [StockNotificationService],
})
export class StockNotificationModule {}
