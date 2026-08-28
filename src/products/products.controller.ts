import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.interface.js';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { ProductListEntity } from './entities/product-list.entity.js';
import { ProductsService } from './products.service.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findMany(
    @Query() query: ListProductsQueryDto,
    @CurrentUser() user?: JwtPayload,
  ): Promise<ProductListEntity> {
    return this.productsService.findMany(query, user);
  }
}
