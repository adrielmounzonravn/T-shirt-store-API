import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { OrderStatus } from '../generated/prisma/enums.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import {
  STOCK_NOTIFICATION_JOB,
  STOCK_NOTIFICATION_QUEUE,
} from './stock-notification.constants.js';

export interface StockNotificationJobData {
  skuId: string;
}

@Injectable()
export class StockNotificationService {
  constructor(
    @InjectQueue(STOCK_NOTIFICATION_QUEUE)
    private readonly queue: Queue<StockNotificationJobData>,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
  ) {}

  async enqueueLowStockNotification(skuId: string): Promise<void> {
    await this.queue.add(STOCK_NOTIFICATION_JOB, { skuId });
  }

  async notifyLikersOfLowStock(skuId: string): Promise<void> {
    const variant = await this.prisma.productVariant.findUniqueOrThrow({
      where: { id: skuId },
      select: { productId: true },
    });

    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id: variant.productId },
      select: {
        name: true,
        images: {
          where: { isCover: true },
          select: { imagePath: true },
          take: 1,
        },
      },
    });

    const coverImagePath = product.images[0]?.imagePath;
    const imageUrl = coverImagePath
      ? this.storage.getPublicUrl(coverImagePath)
      : undefined;

    const likes = await this.prisma.likedProduct.findMany({
      where: {
        productId: variant.productId,
        user: {
          cartNumbers: {
            none: {
              order: {
                status: {
                  notIn: [OrderStatus.pending, OrderStatus.cancelled],
                },
              },
              cartProducts: {
                some: { variant: { productId: variant.productId } },
              },
            },
          },
        },
      },
      select: { user: { select: { email: true } } },
    });

    await Promise.all(
      likes.map(({ user }) =>
        this.mail.sendLowStockNotificationEmail(
          user.email,
          product.name,
          imageUrl,
        ),
      ),
    );
  }
}
