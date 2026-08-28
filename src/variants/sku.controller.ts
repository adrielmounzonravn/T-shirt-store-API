import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { UpdateProductVariantDto } from '../products/dto/update-product-variant.dto.js';
import { ProductVariantEntity } from '../products/entities/product-variant.entity.js';
import { VariantsService } from './variants.service.js';

@ApiTags('Product Variants (SKU)')
@Controller('variants')
export class SkuController {
  constructor(private readonly variantsService: VariantsService) {}

  @Get(':skuId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get variant detail' })
  @ApiParam({ name: 'skuId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Variant detail',
    type: ProductVariantEntity,
  })
  @ApiErrorResponses(404)
  findOne(
    @Param('skuId', ParseUUIDPipe) skuId: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<ProductVariantEntity> {
    return this.variantsService.findOne(skuId, user);
  }

  @Patch(':skuId')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'ProductVariant'))
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Update variant (Manager)' })
  @ApiParam({ name: 'skuId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Variant updated',
    type: ProductVariantEntity,
  })
  @ApiErrorResponses(401, 403, 404)
  update(
    @Param('skuId', ParseUUIDPipe) skuId: string,
    @Body() dto: UpdateProductVariantDto,
  ): Promise<ProductVariantEntity> {
    return this.variantsService.update(skuId, dto);
  }

  @Delete(':skuId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('delete', 'ProductVariant'))
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: 'Delete variant (Manager)',
    description:
      'Soft delete (sets deleted_at). Disappears from all listings/GET, but ' +
      'keeps the row so historical orders stay intact. Not reversible via API. ' +
      'Frees up its size/color/fit/gender combination for a new variant.',
  })
  @ApiParam({ name: 'skuId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Variant deleted' })
  @ApiErrorResponses(401, 403, 404)
  remove(@Param('skuId', ParseUUIDPipe) skuId: string): Promise<void> {
    return this.variantsService.remove(skuId);
  }

  @Patch(':skuId/enable')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'ProductVariant'))
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Enable variant (Manager)' })
  @ApiParam({ name: 'skuId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Variant enabled',
    type: ProductVariantEntity,
  })
  @ApiErrorResponses(401, 403, 404)
  enable(
    @Param('skuId', ParseUUIDPipe) skuId: string,
  ): Promise<ProductVariantEntity> {
    return this.variantsService.enable(skuId);
  }

  @Patch(':skuId/disable')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'ProductVariant'))
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Disable variant (Manager)' })
  @ApiParam({ name: 'skuId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Variant disabled',
    type: ProductVariantEntity,
  })
  @ApiErrorResponses(401, 403, 404)
  disable(
    @Param('skuId', ParseUUIDPipe) skuId: string,
  ): Promise<ProductVariantEntity> {
    return this.variantsService.disable(skuId);
  }
}
