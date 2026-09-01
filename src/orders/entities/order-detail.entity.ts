import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { OrderEntity } from '../../checkout/entities/order.entity.js';
import { OrderItemEntity } from './order-item.entity.js';

@ApiSchema({ name: 'OrderDetail' })
export class OrderDetailEntity extends OrderEntity {
  @ApiProperty({ type: [OrderItemEntity] })
  items: OrderItemEntity[];

  constructor(
    partial: ConstructorParameters<typeof OrderEntity>[0],
    items: ConstructorParameters<typeof OrderItemEntity>[0][],
  ) {
    super(partial);
    this.items = items.map((item) => new OrderItemEntity(item));
  }
}
