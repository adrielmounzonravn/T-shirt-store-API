import { ApiProperty } from '@nestjs/swagger';
import { OrderEntity } from '../../checkout/entities/order.entity.js';
import { PaginationMetaEntity } from '../../products/entities/pagination-meta.entity.js';

export class OrderListEntity {
  @ApiProperty({ type: [OrderEntity] })
  data: OrderEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  pagination: PaginationMetaEntity;

  constructor(partial: {
    data: ConstructorParameters<typeof OrderEntity>[0][];
    pagination: PaginationMetaEntity;
  }) {
    this.data = partial.data.map((order) => new OrderEntity(order));
    this.pagination = new PaginationMetaEntity(partial.pagination);
  }
}
