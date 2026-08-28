import { Injectable, NotFoundException } from '@nestjs/common';
import { Role, ProductStatus } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from '../auth/jwt-payload.interface.js';
import type { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductListEntity } from './entities/product-list.entity.js';
import { ProductEntity } from './entities/product.entity.js';
import { ProductDetailEntity } from './entities/product-detail.entity.js';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    query: ListProductsQueryDto,
    user?: JwtPayload,
  ): Promise<ProductListEntity> {
    const { limit, offset, gender, size, fit, color, status } = query;
    const isManager = user?.role === Role.manager;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      status: isManager ? status : ProductStatus.enabled,
      ...((gender || size || fit || color) && {
        variants: {
          some: {
            deletedAt: null,
            ...(gender && { gender }),
            ...(size && { size }),
            ...(fit && { fit }),
            ...(color && { color }),
          },
        },
      }),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { images: true },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return new ProductListEntity({
      data: products,
      pagination: { limit, offset, total },
    });
  }

  async findOne(id: string, user?: JwtPayload): Promise<ProductDetailEntity> {
    const isManager = user?.role === Role.manager;

    const product = await this.prisma.product.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(!isManager && { status: ProductStatus.enabled }),
      },
      include: {
        images: true,
        variants: { where: { deletedAt: null }, include: { images: true } },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return new ProductDetailEntity(product);
  }

  async create(dto: CreateProductDto): Promise<ProductDetailEntity> {
    const hasVariants = (dto.variants?.length ?? 0) > 0;

    const product = await this.prisma.$transaction((tx) =>
      tx.product.create({
        data: {
          name: dto.name,
          detail: dto.detail,
          status: hasVariants ? ProductStatus.enabled : ProductStatus.disabled,
          ...(hasVariants && {
            variants: { create: dto.variants },
          }),
        },
        include: {
          images: true,
          variants: { include: { images: true } },
        },
      }),
    );

    return new ProductDetailEntity(product);
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductEntity> {
    await this.assertActiveProduct(id);

    const product = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: { images: true },
    });

    return new ProductEntity(product);
  }

  async remove(id: string): Promise<void> {
    await this.assertActiveProduct(id);

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async assertActiveProduct(id: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }
  }
}
