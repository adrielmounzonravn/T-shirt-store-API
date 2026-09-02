import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import {
  Color,
  Fit,
  Gender,
  ProductStatus,
  Size,
} from '../../generated/prisma/enums.js';
import { VariantImageEntity } from './variant-image.entity.js';

interface VariantImageSource {
  id: string;
  skuId: string;
  imagePath: string;
  isCover: boolean;
  createdAt: Date;
}

interface ProductVariantSource {
  id: string;
  productId: string;
  size: Size;
  color: Color;
  fit: Fit;
  gender: Gender;
  stock: number;
  price: unknown;
  status: ProductStatus;
  images: VariantImageSource[];
  createdAt: Date;
  updatedAt: Date;
}

@ApiSchema({ name: 'ProductVariant' })
export class ProductVariantEntity {
  @ApiProperty({ format: 'uuid' })
  skuId: string;

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

  @ApiProperty({ type: 'integer', minimum: 0 })
  stock: number;

  @ApiProperty({
    format: 'float',
    minimum: 0.01,
    maximum: 9999.99,
    multipleOf: 0.01,
    description: 'numeric(6,2), CHECK price > 0',
  })
  price: number;

  @ApiProperty({
    enum: ProductStatus,
    enumName: 'ProductStatus',
    default: ProductStatus.enabled,
  })
  status: ProductStatus;

  @ApiProperty({
    type: [VariantImageEntity],
    description:
      "The image with isCover=true (if any) is the variant's cover image.",
  })
  images: VariantImageEntity[];

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  constructor(partial: ProductVariantSource) {
    this.skuId = partial.id;
    this.productId = partial.productId;
    this.size = partial.size;
    this.color = partial.color;
    this.fit = partial.fit;
    this.gender = partial.gender;
    this.stock = partial.stock;
    this.price = Number(partial.price);
    this.status = partial.status;
    this.images = (partial.images ?? []).map(
      (image) => new VariantImageEntity(image),
    );
    this.createdAt = partial.createdAt;
    this.updatedAt = partial.updatedAt;
  }
}
