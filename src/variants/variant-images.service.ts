import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { UploadImageDto } from '../common/dto/upload-image.dto.js';
import type { SetCoverImageDto } from '../common/dto/set-cover-image.dto.js';
import { VariantImageEntity } from '../products/entities/variant-image.entity.js';

@Injectable()
export class VariantImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(
    skuId: string,
    file: Express.Multer.File,
    dto: UploadImageDto,
  ): Promise<VariantImageEntity> {
    await this.assertActiveVariant(skuId);

    const imageId = randomUUID();
    const key = this.storage.buildObjectKey(
      'variants',
      skuId,
      imageId,
      file.originalname,
      file.mimetype,
    );

    await this.storage.upload(key, file);

    const image = await this.prisma.$transaction(async (tx) => {
      if (dto.isCover) {
        await tx.variantImage.updateMany({
          where: { skuId, isCover: true },
          data: { isCover: false },
        });
      }

      return tx.variantImage.create({
        data: {
          id: imageId,
          skuId,
          imagePath: key,
          isCover: dto.isCover,
        },
      });
    });

    return new VariantImageEntity(image);
  }

  async setCover(
    imageId: string,
    dto: SetCoverImageDto,
  ): Promise<VariantImageEntity> {
    const existing = await this.findImageOrThrow(imageId);

    const image = await this.prisma.$transaction(async (tx) => {
      await tx.variantImage.updateMany({
        where: {
          skuId: existing.skuId,
          isCover: true,
          id: { not: imageId },
        },
        data: { isCover: false },
      });

      return tx.variantImage.update({
        where: { id: imageId },
        data: { isCover: dto.isCover },
      });
    });

    return new VariantImageEntity(image);
  }

  async remove(imageId: string): Promise<void> {
    const existing = await this.findImageOrThrow(imageId);

    await this.storage.delete(existing.imagePath);
    await this.prisma.variantImage.delete({ where: { id: imageId } });
  }

  private async findImageOrThrow(imageId: string) {
    const image = await this.prisma.variantImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    return image;
  }

  private async assertActiveVariant(skuId: string): Promise<void> {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: skuId, deletedAt: null },
      select: { id: true },
    });

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }
  }
}
