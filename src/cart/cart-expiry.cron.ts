import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CartService } from './cart.service.js';

@Injectable()
export class CartExpiryCron {
  private readonly logger = new Logger(CartExpiryCron.name);

  constructor(private readonly cartService: CartService) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'cart-expiry-sweep' })
  async sweep(): Promise<void> {
    try {
      const count = await this.cartService.expireStaleCarts();
      this.logger.log(`Expired ${count} stale cart(s)`);
    } catch (error) {
      this.logger.error(
        'Cart expiry sweep failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
