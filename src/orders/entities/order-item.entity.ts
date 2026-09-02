import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { Color, Fit, Gender, Size } from '../../generated/prisma/enums.js';

interface OrderItemVariantSource {
  productId: string;
  size: Size;
  color: Color;
  fit: Fit;
  gender: Gender;
}

@ApiSchema({ name: 'OrderItemVariant' })
export class OrderItemVariantEntity {
  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty({ enum: Size, enumName: 'Size' })
  size: Size;

  @ApiProperty({ enum: Color, enumName: 'Color' })
  color: Color;

  @ApiProperty({ enum: Fit, enumName: 'Fit' })
  fit: Fit;

  @ApiProperty({ enum: Gender, enumName: 'Gender' })
  gender: Gender;

  constructor(partial: OrderItemVariantSource) {
    this.productId = partial.productId;
    this.size = partial.size;
    this.color = partial.color;
    this.fit = partial.fit;
    this.gender = partial.gender;
  }
}

interface OrderItemSource {
  skuId: string;
  variant: OrderItemVariantSource;
  quantity: number;
  unitPrice: number;
}

@ApiSchema({ name: 'OrderItem' })
export class OrderItemEntity {
  @ApiProperty({ format: 'uuid' })
  skuId: string;

  @ApiProperty({ type: OrderItemVariantEntity })
  variant: OrderItemVariantEntity;

  @ApiProperty({ type: 'integer' })
  quantity: number;

  @ApiProperty({ format: 'float', description: 'Price frozen at purchase.' })
  unitPrice: number;

  @ApiProperty({ format: 'float' })
  lineTotal: number;

  constructor(partial: OrderItemSource) {
    this.skuId = partial.skuId;
    this.variant = new OrderItemVariantEntity(partial.variant);
    this.quantity = partial.quantity;
    this.unitPrice = partial.unitPrice;
    this.lineTotal = partial.unitPrice * partial.quantity;
  }
}
