import { ApiProperty, ApiSchema } from '@nestjs/swagger';

interface VariantImageSource {
  id: string;
  skuId: string;
  imagePath: string;
  isCover: boolean;
  createdAt: Date;
}

@ApiSchema({ name: 'VariantImage' })
export class VariantImageEntity {
  @ApiProperty({ format: 'uuid' })
  imageId: string;

  @ApiProperty({ format: 'uuid' })
  skuId: string;

  @ApiProperty({
    description:
      'S3 key (image_path) stored for this image, used by the backend to reconstruct the URL.',
  })
  imagePath: string;

  @ApiProperty({
    default: false,
    description:
      "Whether this is the variant's cover image. At most one image per SKU can be true.",
  })
  isCover: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  constructor(partial: VariantImageSource) {
    this.imageId = partial.id;
    this.skuId = partial.skuId;
    this.imagePath = partial.imagePath;
    this.isCover = partial.isCover;
    this.createdAt = partial.createdAt;
  }
}
