import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.interface.js';
import { PoliciesGuard } from '../casl/guards/policies.guard.js';
import { CheckPolicies } from '../casl/decorators/check-policies.decorator.js';
import { CreateProductVariantDto } from '../products/dto/create-product-variant.dto.js';
import { ProductVariantEntity } from '../products/entities/product-variant.entity.js';
import { VariantsService } from './variants.service.js';

@Controller('products/:productId/variants')
export class VariantsController {
  constructor(private readonly variantsService: VariantsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findMany(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<ProductVariantEntity[]> {
    return this.variantsService.findMany(productId, user);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'ProductVariant'))
  create(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateProductVariantDto,
  ): Promise<ProductVariantEntity> {
    return this.variantsService.create(productId, dto);
  }
}
