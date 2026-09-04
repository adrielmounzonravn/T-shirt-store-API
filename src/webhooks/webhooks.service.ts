import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import type { Prisma } from '../generated/prisma/client.js';
import { OrderStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StockNotificationService } from '../stock-notification/stock-notification.service.js';
import { STRIPE_CLIENT } from '../stripe/stripe-client.provider.js';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly stockNotificationService: StockNotificationService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
  ) {}

  async handleStripeEvent(rawBody: Buffer, signature: string): Promise<void> {
    const webhookSecret = this.configService.getOrThrow<string>(
      'stripe.webhookSecret',
    );

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch {
      throw new BadRequestException('Invalid Stripe webhook payload');
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.markOrderPaid(event.data.object.metadata?.orderId);
        break;
      case 'payment_intent.succeeded':
        await this.markOrderPaid(event.data.object.metadata?.orderId);
        break;
      default:
        this.logger.log(`Ignoring unhandled Stripe event type: ${event.type}`);
    }
  }

  private async markOrderPaid(orderId: string | undefined): Promise<void> {
    if (!orderId) {
      this.logger.warn('Stripe event carried no orderId in its metadata');
      return;
    }

    const lowStockThreshold =
      this.configService.getOrThrow<number>('lowStockThreshold');

    const skusToNotify = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.pending },
        data: { status: OrderStatus.paid },
      });

      if (count === 0) {
        return [];
      }

      return this.decrementStock(tx, orderId, lowStockThreshold);
    });

    for (const skuId of skusToNotify) {
      await this.stockNotificationService.enqueueLowStockNotification(skuId);
    }
  }

  private async decrementStock(
    tx: Prisma.TransactionClient,
    orderId: string,
    lowStockThreshold: number,
  ): Promise<string[]> {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { cartNumber: true },
    });

    const cartProducts = await tx.cartProduct.findMany({
      where: { cartNumber: order.cartNumber },
      select: { skuId: true, quantity: true },
    });

    const skusToNotify: string[] = [];

    for (const { skuId, quantity } of cartProducts) {
      const variant = await tx.productVariant.update({
        where: { id: skuId },
        data: { stock: { decrement: quantity } },
        select: { stock: true },
      });

      const stockBeforeDecrement = variant.stock + quantity;
      if (
        stockBeforeDecrement > lowStockThreshold &&
        variant.stock <= lowStockThreshold
      ) {
        this.logger.log(
          `Variant ${skuId} crossed the low-stock threshold (${lowStockThreshold})`,
        );
        skusToNotify.push(skuId);
      }
    }

    return skusToNotify;
  }
}
