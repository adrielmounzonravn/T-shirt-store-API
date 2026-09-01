import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { PoliciesGuard } from '../casl/guards/policies.guard.js';
import { CheckPolicies } from '../casl/decorators/check-policies.decorator.js';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator.js';
import { CartService } from './cart.service.js';
import { AddCartItemDto } from './dto/add-cart-item.dto.js';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.js';
import { CartEntity } from './entities/cart.entity.js';

@ApiTags('Cart')
@ApiBearerAuth('bearerAuth')
@Controller('me/cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', 'Cart'))
  @ApiOperation({
    summary: 'Get current active cart (Client)',
    description:
      'Returns the status=active cart of the authenticated user. If it ' +
      'does not exist, an empty one is created transparently (the ' +
      '"invisible" cart).',
  })
  @ApiResponse({ status: 200, description: 'Active cart', type: CartEntity })
  @ApiErrorResponses(401, 403)
  getCart(@CurrentUser('sub') userId: string): Promise<CartEntity> {
    return this.cartService.getCart(userId);
  }

  @Post('items')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Cart'))
  @ApiOperation({
    summary: 'Add SKU to cart (Client)',
    description:
      'If the SKU is already in the active cart, increments quantity ' +
      '(upsert via the composite unique cart_number+sku_id) instead of ' +
      'duplicating the line.',
  })
  @ApiResponse({ status: 200, description: 'Updated cart', type: CartEntity })
  @ApiErrorResponses(401, 403, 404, 409)
  addItem(
    @CurrentUser('sub') userId: string,
    @Body() dto: AddCartItemDto,
  ): Promise<CartEntity> {
    return this.cartService.addItem(userId, dto);
  }

  @Patch('items/:skuId')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', 'Cart'))
  @ApiOperation({ summary: 'Update quantity of a cart line (Client)' })
  @ApiParam({ name: 'skuId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated cart', type: CartEntity })
  @ApiErrorResponses(401, 403, 404, 409)
  updateItem(
    @CurrentUser('sub') userId: string,
    @Param('skuId', ParseUUIDPipe) skuId: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<CartEntity> {
    return this.cartService.updateItem(userId, skuId, dto);
  }

  @Delete('items/:skuId')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('delete', 'Cart'))
  @ApiOperation({ summary: 'Remove SKU from cart (Client)' })
  @ApiParam({ name: 'skuId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated cart', type: CartEntity })
  @ApiErrorResponses(401, 403, 404)
  removeItem(
    @CurrentUser('sub') userId: string,
    @Param('skuId', ParseUUIDPipe) skuId: string,
  ): Promise<CartEntity> {
    return this.cartService.removeItem(userId, skuId);
  }
}
