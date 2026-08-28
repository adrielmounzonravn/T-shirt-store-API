import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { ProductEntity } from './product.entity.js';
import { ProductVariantEntity } from './product-variant.entity.js';

@ApiSchema({ name: 'ProductDetail' })
export class ProductDetailEntity extends ProductEntity {
  @ApiProperty({ type: [ProductVariantEntity] })
  variants: ProductVariantEntity[];

  constructor(
    partial: ConstructorParameters<typeof ProductEntity>[0] & {
      variants?: ConstructorParameters<typeof ProductVariantEntity>[0][];
    },
  ) {
    super(partial);
    this.variants = (partial.variants ?? []).map(
      (variant) => new ProductVariantEntity(variant),
    );
  }
}
