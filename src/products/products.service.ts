import { Injectable } from '@nestjs/common';
import { Role, ProductStatus } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from '../auth/jwt-payload.interface.js';
import type { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { ProductListEntity } from './entities/product-list.entity.js';

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
}
