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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.interface.js';
import { PoliciesGuard } from '../casl/guards/policies.guard.js';
import { CheckPolicies } from '../casl/decorators/check-policies.decorator.js';
import { UpdateProductVariantDto } from '../products/dto/update-product-variant.dto.js';
import { ProductVariantEntity } from '../products/entities/product-variant.entity.js';
import { VariantsService } from './variants.service.js';

@Controller('variants')
export class SkuController {
  constructor(private readonly variantsService: VariantsService) {}

  @Get(':skuId')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(
    @Param('skuId', ParseUUIDPipe) skuId: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<ProductVariantEntity> {
    return this.variantsService.findOne(skuId, user);
  }

  @Patch(':skuId')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'ProductVariant'))
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
  remove(@Param('skuId', ParseUUIDPipe) skuId: string): Promise<void> {
    return this.variantsService.remove(skuId);
  }
}
