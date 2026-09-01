import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { ProductVariantEntity } from '../../products/entities/product-variant.entity.js';

interface CartItemSource {
  skuId: string;
  variant: ConstructorParameters<typeof ProductVariantEntity>[0];
  quantity: number;
  unitPrice: unknown;
}

@ApiSchema({ name: 'CartItem' })
export class CartItemEntity {
  @ApiProperty({ format: 'uuid' })
  skuId: string;

  @ApiProperty({ type: ProductVariantEntity })
  variant: ProductVariantEntity;

  @ApiProperty({ type: 'integer', minimum: 1 })
  quantity: number;

  @ApiProperty({
    format: 'float',
    nullable: true,
    description:
      'Null while the cart is active; frozen once confirmed as an order.',
  })
  unitPrice: number | null;

  constructor(partial: CartItemSource) {
    this.skuId = partial.skuId;
    this.variant = new ProductVariantEntity(partial.variant);
    this.quantity = partial.quantity;
    this.unitPrice =
      partial.unitPrice === null || partial.unitPrice === undefined
        ? null
        : Number(partial.unitPrice);
  }
}
