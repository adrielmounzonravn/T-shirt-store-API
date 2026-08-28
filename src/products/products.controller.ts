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
  Post,
  Query,
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
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductListEntity } from './entities/product-list.entity.js';
import { ProductEntity } from './entities/product.entity.js';
import { ProductDetailEntity } from './entities/product-detail.entity.js';
import { ProductsService } from './products.service.js';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'List products (pagination + category filters)',
    description:
      '"Category" is derived from the gender/size/fit/color filters on the variants ' +
      '(documented decision: the store does not model a separate Category entity).',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated product list',
    type: ProductListEntity,
  })
  findMany(
    @Query() query: ListProductsQueryDto,
    @CurrentUser() user?: JwtPayload,
  ): Promise<ProductListEntity> {
    return this.productsService.findMany(query, user);
  }

  @Get(':productId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Get product detail (with variants and images)',
    description: 'Visible to both logged-in and non-logged-in users.',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Product detail',
    type: ProductDetailEntity,
  })
  @ApiErrorResponses(404)
  findOne(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<ProductDetailEntity> {
    return this.productsService.findOne(productId, user);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Product'))
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: 'Create product, optionally with its variants (Manager)',
    description: `Two flows through one endpoint, decided by the optional \`variants\` array:

- **With \`variants\` (1 or more):** product and SKUs are created in a single
  transaction and the product is born \`status=enabled\` — it already has
  something purchasable, so the intermediate "product with no SKUs" state
  never exists. If any variant fails validation, nothing is persisted.

- **Without \`variants\`:** product is created \`status=disabled\` (the DB
  default) — a product with no SKUs must not be visible/purchasable to
  clients. Add variants via POST /products/{productId}/variants and enable
  it explicitly via PATCH /products/{productId}/enable.

Images are not part of this call (they are multipart/form-data) — upload
them afterwards via POST /products/{productId}/images.`,
  })
  @ApiResponse({
    status: 201,
    description:
      'Product created. `variants` is the array of SKUs created in the same ' +
      'transaction — empty when the request did not include any.',
    type: ProductDetailEntity,
  })
  @ApiErrorResponses(401, 403)
  @ApiResponse({
    status: 409,
    description:
      'Two or more entries in `variants` share the same ' +
      'size/color/fit/gender combination — the combination must be unique ' +
      'per product (partial unique index one_active_combo_per_product).',
  })
  create(@Body() dto: CreateProductDto): Promise<ProductDetailEntity> {
    return this.productsService.create(dto);
  }

  @Patch(':productId')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Product'))
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Update product (Manager)' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Product updated',
    type: ProductEntity,
  })
  @ApiErrorResponses(401, 403, 404)
  update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductEntity> {
    return this.productsService.update(productId, dto);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('delete', 'Product'))
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: 'Delete product (Manager)',
    description:
      'Soft delete (sets deleted_at). Disappears from all listings/GET, but ' +
      'keeps the row so historical orders stay intact. Not reversible via API.',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Product deleted' })
  @ApiErrorResponses(401, 403, 404)
  remove(@Param('productId', ParseUUIDPipe) productId: string): Promise<void> {
    return this.productsService.remove(productId);
  }

  @Patch(':productId/enable')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Product'))
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Enable product (Manager)' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Product enabled',
    type: ProductEntity,
  })
  @ApiErrorResponses(401, 403, 404)
  enable(
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<ProductEntity> {
    return this.productsService.enable(productId);
  }

  @Patch(':productId/disable')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Product'))
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: 'Disable product (Manager)',
    description:
      'Marks the product as disabled. A disabled product is considered ' +
      'non-purchasable even if its variants are enabled (AND at the service layer).',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Product disabled',
    type: ProductEntity,
  })
  @ApiErrorResponses(401, 403, 404)
  disable(
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<ProductEntity> {
    return this.productsService.disable(productId);
  }
}
