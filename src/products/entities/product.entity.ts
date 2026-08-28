import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { ProductStatus } from '../../generated/prisma/enums.js';
import { ProductImageEntity } from './product-image.entity.js';

interface ProductImageSource {
  id: string;
  productId: string;
  imagePath: string;
  isCover: boolean;
  createdAt: Date;
}

interface ProductSource {
  id: string;
  name: string;
  detail: string | null;
  status: ProductStatus;
  images: ProductImageSource[];
  createdAt: Date;
  updatedAt: Date;
}

@ApiSchema({ name: 'Product' })
export class ProductEntity {
  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  detail: string | null;

  @ApiProperty({
    enum: ProductStatus,
    enumName: 'ProductStatus',
    default: ProductStatus.disabled,
  })
  status: ProductStatus;

  @ApiProperty({
    type: [ProductImageEntity],
    description:
      "The image with isCover=true (if any) is the product's cover image.",
  })
  images: ProductImageEntity[];

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  constructor(partial: ProductSource) {
    this.productId = partial.id;
    this.name = partial.name;
    this.detail = partial.detail;
    this.status = partial.status;
    this.images = (partial.images ?? []).map(
      (image) => new ProductImageEntity(image),
    );
    this.createdAt = partial.createdAt;
    this.updatedAt = partial.updatedAt;
  }
}
