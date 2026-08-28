import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from './pagination-meta.entity.js';
import { ProductEntity } from './product.entity.js';

export class ProductListEntity {
  @ApiProperty({ type: [ProductEntity] })
  data: ProductEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  pagination: PaginationMetaEntity;

  constructor(partial: {
    data: ConstructorParameters<typeof ProductEntity>[0][];
    pagination: PaginationMetaEntity;
  }) {
    this.data = partial.data.map((product) => new ProductEntity(product));
    this.pagination = new PaginationMetaEntity(partial.pagination);
  }
}
