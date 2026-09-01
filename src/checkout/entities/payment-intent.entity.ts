import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { OrderEntity } from './order.entity.js';

@ApiSchema({ name: 'PaymentIntentCreated' })
export class PaymentIntentEntity {
  @ApiProperty({ type: OrderEntity })
  order: OrderEntity;

  @ApiProperty()
  clientSecret: string;

  constructor(partial: PaymentIntentEntity) {
    this.order = partial.order;
    this.clientSecret = partial.clientSecret;
  }
}
