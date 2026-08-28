import { Injectable, NotFoundException } from '@nestjs/common';
import { Role, ProductStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from '../auth/jwt-payload.interface.js';
import type { CreateProductVariantDto } from '../products/dto/create-product-variant.dto.js';
import { ProductVariantEntity } from '../products/entities/product-variant.entity.js';

@Injectable()
export class VariantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    productId: string,
    user?: JwtPayload,
  ): Promise<ProductVariantEntity[]> {
    const isManager = user?.role === Role.manager;

    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        deletedAt: null,
        ...(!isManager && { status: ProductStatus.enabled }),
      },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const variants = await this.prisma.productVariant.findMany({
      where: {
        productId,
        deletedAt: null,
        ...(!isManager && { status: ProductStatus.enabled }),
      },
      include: { images: true },
      orderBy: { createdAt: 'desc' },
    });

    return variants.map((variant) => new ProductVariantEntity(variant));
  }

  async create(
    productId: string,
    dto: CreateProductVariantDto,
  ): Promise<ProductVariantEntity> {
    await this.assertActiveProduct(productId);

    const variant = await this.prisma.productVariant.create({
      data: { ...dto, productId },
      include: { images: true },
    });

    return new ProductVariantEntity(variant);
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
