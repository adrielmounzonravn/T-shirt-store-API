import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.interface.js';
import { PoliciesGuard } from '../casl/guards/policies.guard.js';
import { CheckPolicies } from '../casl/decorators/check-policies.decorator.js';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator.js';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto.js';
import { AdvanceOrderStatusDto } from './dto/advance-order-status.dto.js';
import { OrderListEntity } from './entities/order-list.entity.js';
import { OrderDetailEntity } from './entities/order-detail.entity.js';
import { OrderEntity } from '../checkout/entities/order.entity.js';
import { OrdersService } from './orders.service.js';

@ApiTags('Orders')
@ApiBearerAuth('bearerAuth')
@Controller('orders')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'Order'))
  @ApiOperation({
    summary: 'List orders (own orders for Client, all orders for Manager)',
    description:
      'Client sees only their own orders — the userId filter is ignored ' +
      'for them. Manager sees the orders of all clients, and can narrow ' +
      'to a single client with ?userId=.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated order list',
    type: OrderListEntity,
  })
  @ApiErrorResponses(401, 403)
  findMany(
    @Query() query: ListOrdersQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderListEntity> {
    return this.ordersService.findMany(query, user);
  }

  @Get(':orderId')
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @CheckPolicies((ability) => ability.can('read', 'Order'))
  @ApiOperation({
    summary: 'Get order detail',
    description:
      'Includes the purchased products (with quantities and individual ' +
      'prices frozen at purchase time), payment method, total amount paid, ' +
      'and status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Order detail',
    type: OrderDetailEntity,
  })
  @ApiErrorResponses(401, 403, 404)
  findOne(
    @Param('orderId') orderId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderDetailEntity> {
    return this.ordersService.findOne(orderId, user);
  }

  @Patch(':orderId/status')
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @CheckPolicies((ability) => ability.can('update', 'Order'))
  @ApiOperation({
    summary: 'Advance order status (Manager)',
    description:
      'Manager can advance paid → processing → shipped. Transitions ' +
      'outside the allowed flow return 422.',
  })
  @ApiResponse({
    status: 200,
    description: 'Status updated',
    type: OrderEntity,
  })
  @ApiErrorResponses(401, 403, 404, 422)
  advanceStatus(
    @Param('orderId') orderId: string,
    @Body() dto: AdvanceOrderStatusDto,
  ): Promise<OrderEntity> {
    return this.ordersService.advanceStatus(orderId, dto.status);
  }

  @Patch(':orderId/cancel')
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @CheckPolicies((ability) => ability.can('cancel', 'Order'))
  @ApiOperation({
    summary: 'Cancel own order (Client)',
    description: 'Only allowed before the order reaches shipped.',
  })
  @ApiResponse({
    status: 200,
    description: 'Order cancelled',
    type: OrderEntity,
  })
  @ApiErrorResponses(401, 403, 404, 422)
  cancel(
    @Param('orderId') orderId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderEntity> {
    return this.ordersService.cancel(orderId, user);
  }
}
