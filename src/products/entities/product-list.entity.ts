import { PaginationMetaEntity } from './pagination-meta.entity.js';
import { ProductEntity } from './product.entity.js';

export class ProductListEntity {
  data: ProductEntity[];
  pagination: PaginationMetaEntity;

  constructor(partial: ProductListEntity) {
    this.data = partial.data.map((product) => new ProductEntity(product));
    this.pagination = new PaginationMetaEntity(partial.pagination);
  }
}
