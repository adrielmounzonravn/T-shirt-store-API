import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { OrderEntity } from '../../checkout/entities/order.entity.js';
import { OrderItemEntity } from './order-item.entity.js';

interface DeliveryPersonSource {
  fullName: string;
  email: string;
}

@ApiSchema({ name: 'OrderDeliveryPerson' })
export class OrderDeliveryPersonEntity {
  @ApiProperty()
  fullName: string;

  @ApiProperty({ format: 'email' })
  email: string;

  constructor(partial: DeliveryPersonSource) {
    this.fullName = partial.fullName;
    this.email = partial.email;
  }
}

@ApiSchema({ name: 'OrderDetail' })
export class OrderDetailEntity extends OrderEntity {
  @ApiProperty({ type: [OrderItemEntity] })
  items: OrderItemEntity[];

  @ApiProperty({ type: OrderDeliveryPersonEntity, nullable: true })
  deliveryPerson: OrderDeliveryPersonEntity | null;

  constructor(
    partial: ConstructorParameters<typeof OrderEntity>[0],
    items: ConstructorParameters<typeof OrderItemEntity>[0][],
    deliveryPerson: DeliveryPersonSource | null = null,
  ) {
    super(partial);
    this.items = items.map((item) => new OrderItemEntity(item));
    this.deliveryPerson = deliveryPerson
      ? new OrderDeliveryPersonEntity(deliveryPerson)
      : null;
  }
}
