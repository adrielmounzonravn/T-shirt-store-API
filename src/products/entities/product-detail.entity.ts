import { ProductEntity } from './product.entity.js';
import { ProductVariantEntity } from './product-variant.entity.js';

export class ProductDetailEntity extends ProductEntity {
  variants: ProductVariantEntity[];

  constructor(
    partial: Partial<Omit<ProductDetailEntity, 'variants'>> & {
      variants?: ConstructorParameters<typeof ProductVariantEntity>[0][];
    },
  ) {
    super(partial);
    this.variants = (partial.variants ?? []).map(
      (variant) => new ProductVariantEntity(variant),
    );
  }
}
