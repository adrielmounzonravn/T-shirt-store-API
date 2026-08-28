import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.interface.js';
import { PoliciesGuard } from '../casl/guards/policies.guard.js';
import { CheckPolicies } from '../casl/decorators/check-policies.decorator.js';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator.js';
import { CreateProductVariantDto } from '../products/dto/create-product-variant.dto.js';
import { ProductVariantEntity } from '../products/entities/product-variant.entity.js';
import { VariantsService } from './variants.service.js';

@ApiTags('Product Variants (SKU)')
@Controller('products/:productId/variants')
export class VariantsController {
  constructor(private readonly variantsService: VariantsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'List variants of a product' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Variant list',
    type: [ProductVariantEntity],
  })
  findMany(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<ProductVariantEntity[]> {
    return this.variantsService.findMany(productId, user);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'ProductVariant'))
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: 'Create product variant / SKU (Manager)',
    description:
      'Combination (size, color, fit, gender) unique per product — composite ' +
      'unique constraint on product_variants.',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Variant created',
    type: ProductVariantEntity,
  })
  @ApiErrorResponses(401, 403)
  @ApiResponse({
    status: 409,
    description:
      'A variant with that size/color/fit/gender combination already exists for this product',
  })
  create(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateProductVariantDto,
  ): Promise<ProductVariantEntity> {
    return this.variantsService.create(productId, dto);
  }
}
