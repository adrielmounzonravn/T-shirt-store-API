import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { OrderStatus } from '../../generated/prisma/enums.js';

export const PaymentMethod = {
  payment_link: 'payment_link',
  payment_intent: 'payment_intent',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

interface OrderSource {
  id: string;
  cartNumber: string;
  userId: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  totalAmount: number;
  deliveryPersonId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@ApiSchema({ name: 'Order' })
export class OrderEntity {
  @ApiProperty({ format: 'uuid' })
  orderId: string;

  @ApiProperty({ format: 'uuid' })
  cartNumber: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status: OrderStatus;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  paymentMethod: PaymentMethod;

  @ApiProperty({ format: 'float' })
  totalAmount: number;

  @ApiProperty({ format: 'uuid', nullable: true })
  deliveryPersonId: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  constructor(partial: OrderSource) {
    this.orderId = partial.id;
    this.cartNumber = partial.cartNumber;
    this.userId = partial.userId;
    this.status = partial.status;
    this.paymentMethod = partial.paymentMethod;
    this.totalAmount = partial.totalAmount;
    this.deliveryPersonId = partial.deliveryPersonId ?? null;
    this.createdAt = partial.createdAt;
    this.updatedAt = partial.updatedAt;
  }
}
