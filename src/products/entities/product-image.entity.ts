import { ApiProperty, ApiSchema } from '@nestjs/swagger';

interface ProductImageSource {
  id: string;
  productId: string;
  imagePath: string;
  isCover: boolean;
  createdAt: Date;
}

@ApiSchema({ name: 'ProductImage' })
export class ProductImageEntity {
  @ApiProperty({ format: 'uuid' })
  imageId: string;

  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty({
    description:
      'S3 key (image_path) stored for this image, used by the backend to reconstruct the URL.',
  })
  imagePath: string;

  @ApiProperty({
    default: false,
    description:
      "Whether this is the product's cover image. At most one image per product can be true.",
  })
  isCover: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  constructor(partial: ProductImageSource) {
    this.imageId = partial.id;
    this.productId = partial.productId;
    this.imagePath = partial.imagePath;
    this.isCover = partial.isCover;
    this.createdAt = partial.createdAt;
  }
}
