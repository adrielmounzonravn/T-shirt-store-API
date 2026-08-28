import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { UploadImageDto } from '../common/dto/upload-image.dto.js';
import type { SetCoverImageDto } from '../common/dto/set-cover-image.dto.js';
import { ProductImageEntity } from './entities/product-image.entity.js';

@Injectable()
export class ProductImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(
    productId: string,
    file: Express.Multer.File,
    dto: UploadImageDto,
  ): Promise<ProductImageEntity> {
    await this.assertActiveProduct(productId);

    const imageId = randomUUID();
    const key = this.storage.buildObjectKey(
      'products',
      productId,
      imageId,
      file.originalname,
      file.mimetype,
    );

    await this.storage.upload(key, file);

    const image = await this.prisma.$transaction(async (tx) => {
      if (dto.isCover) {
        await tx.productImage.updateMany({
          where: { productId, isCover: true },
          data: { isCover: false },
        });
      }

      return tx.productImage.create({
        data: {
          id: imageId,
          productId,
          imagePath: key,
          isCover: dto.isCover,
        },
      });
    });

    return new ProductImageEntity(image);
  }

  async setCover(
    imageId: string,
    dto: SetCoverImageDto,
  ): Promise<ProductImageEntity> {
    const existing = await this.findImageOrThrow(imageId);

    const image = await this.prisma.$transaction(async (tx) => {
      await tx.productImage.updateMany({
        where: {
          productId: existing.productId,
          isCover: true,
          id: { not: imageId },
        },
        data: { isCover: false },
      });

      return tx.productImage.update({
        where: { id: imageId },
        data: { isCover: dto.isCover },
      });
    });

    return new ProductImageEntity(image);
  }

  async remove(imageId: string): Promise<void> {
    const existing = await this.findImageOrThrow(imageId);

    await this.storage.delete(existing.imagePath);
    await this.prisma.productImage.delete({ where: { id: imageId } });
  }

  private async findImageOrThrow(imageId: string) {
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    return image;
  }

  private async assertActiveProduct(productId: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }
  }
}
