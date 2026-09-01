import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { CartStatus } from '../../generated/prisma/enums.js';
import { CartItemEntity } from './cart-item.entity.js';

interface CartSource {
  cartNumber: string;
  status: CartStatus;
  expiresAt: Date;
  items: ConstructorParameters<typeof CartItemEntity>[0][];
}

@ApiSchema({ name: 'Cart' })
export class CartEntity {
  @ApiProperty({ format: 'uuid' })
  cartNumber: string;

  @ApiProperty({ enum: CartStatus, enumName: 'CartStatus' })
  status: CartStatus;

  @ApiProperty({ format: 'date-time' })
  expiresAt: Date;

  @ApiProperty({ type: [CartItemEntity] })
  items: CartItemEntity[];

  @ApiProperty({
    format: 'float',
    description:
      "Calculated dynamically from each variant's current price (not yet confirmed as an order).",
  })
  subtotal: number;

  constructor(partial: CartSource) {
    this.cartNumber = partial.cartNumber;
    this.status = partial.status;
    this.expiresAt = partial.expiresAt;
    this.items = partial.items.map((item) => new CartItemEntity(item));
    this.subtotal = this.items.reduce(
      (sum, item) => sum + item.variant.price * item.quantity,
      0,
    );
  }
}
