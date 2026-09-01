import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { OrderEntity } from './order.entity.js';

@ApiSchema({ name: 'PaymentLinkCreated' })
export class PaymentLinkEntity {
  @ApiProperty({ type: OrderEntity })
  order: OrderEntity;

  @ApiProperty({ format: 'uri' })
  paymentLink: string;

  constructor(partial: PaymentLinkEntity) {
    this.order = partial.order;
    this.paymentLink = partial.paymentLink;
  }
}
