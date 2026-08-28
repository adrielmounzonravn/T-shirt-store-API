import type { ProductStatus } from '../../generated/prisma/enums.js';
import { ProductImageEntity } from './product-image.entity.js';

export class ProductEntity {
  id: string;
  name: string;
  detail: string | null;
  status: ProductStatus;
  images: ProductImageEntity[];
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<ProductEntity>) {
    Object.assign(this, partial);
    this.images = (partial.images ?? []).map(
      (image) => new ProductImageEntity(image),
    );
  }
}
