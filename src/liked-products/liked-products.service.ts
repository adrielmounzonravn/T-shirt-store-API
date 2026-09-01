import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ListLikedProductsQueryDto } from './dto/list-liked-products-query.dto.js';
import { LikedProductsListEntity } from './entities/liked-products-list.entity.js';

@Injectable()
export class LikedProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    userId: string,
    query: ListLikedProductsQueryDto,
  ): Promise<LikedProductsListEntity> {
    const { limit, offset } = query;

    const [likedProducts, total] = await Promise.all([
      this.prisma.likedProduct.findMany({
        where: { userId },
        take: limit,
        skip: offset,
        orderBy: { productId: 'asc' },
      }),
      this.prisma.likedProduct.count({ where: { userId } }),
    ]);

    return new LikedProductsListEntity({
      data: likedProducts.map((likedProduct) => likedProduct.productId),
      pagination: { limit, offset, total },
    });
  }

  async like(userId: string, productId: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.likedProduct.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });
  }

  async unlike(userId: string, productId: string): Promise<void> {
    await this.prisma.likedProduct.deleteMany({
      where: { userId, productId },
    });
  }
}
