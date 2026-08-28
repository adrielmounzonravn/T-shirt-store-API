import type {
  Color,
  Fit,
  Gender,
  ProductStatus,
  Size,
} from '../../generated/prisma/enums.js';
import { VariantImageEntity } from './variant-image.entity.js';

export class ProductVariantEntity {
  id: string;
  productId: string;
  size: Size;
  color: Color;
  fit: Fit;
  gender: Gender;
  stock: number;
  price: number;
  status: ProductStatus;
  images: VariantImageEntity[];
  createdAt: Date;
  updatedAt: Date;

  constructor(
    partial: Partial<Omit<ProductVariantEntity, 'price'>> & {
      price?: unknown;
    },
  ) {
    Object.assign(this, partial);
    this.price = Number(partial.price);
    this.images = (partial.images ?? []).map(
      (image) => new VariantImageEntity(image),
    );
  }
}
