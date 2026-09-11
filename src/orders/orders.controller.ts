import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { AssignDeliveryPersonDto } from './dto/assign-delivery-person.dto.js';
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
    summary:
      'List orders (own orders for Client, assigned orders for Delivery ' +
      'Person, all orders for Manager)',
    description:
      'Client sees only their own orders, and Delivery Person sees only ' +
      'orders assigned to them — the userId and deliveryPersonId filters ' +
      'are ignored for both. Manager sees the orders of all clients, and ' +
      'can narrow to a single client with ?userId= or to a single ' +
      'delivery person with ?deliveryPersonId=.',
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
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderDetailEntity> {
    return this.ordersService.findOne(orderId, user);
  }

  @Patch(':orderId/status')
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @CheckPolicies((ability) => ability.can('update', 'Order'))
  @ApiOperation({
    summary: 'Advance order status (Manager, Delivery Person)',
    description:
      'Manager can advance paid → processing → shipped. The assigned ' +
      'delivery person can advance shipped → delivered on their own order, ' +
      'and nothing else. Transitions outside the allowed flow return 422.',
  })
  @ApiResponse({
    status: 200,
    description: 'Status updated',
    type: OrderEntity,
  })
  @ApiErrorResponses(401, 403, 404, 422)
  advanceStatus(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: AdvanceOrderStatusDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderEntity> {
    return this.ordersService.advanceStatus(orderId, dto.status, user);
  }

  @Patch(':orderId/delivery-person')
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @CheckPolicies((ability) => ability.can('assign', 'Order'))
  @ApiOperation({
    summary: 'Assign a delivery person to an order (Manager)',
    description:
      'Only allowed while the order is paid or processing. Reassigning to ' +
      'a different delivery person replaces the previous assignment; ' +
      're-assigning the same person is idempotent.',
  })
  @ApiResponse({
    status: 200,
    description: 'Delivery person assigned',
    type: OrderEntity,
  })
  @ApiErrorResponses(401, 403, 404, 422)
  assignDeliveryPerson(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: AssignDeliveryPersonDto,
  ): Promise<OrderEntity> {
    return this.ordersService.assignDeliveryPerson(
      orderId,
      dto.deliveryPersonId,
    );
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
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderEntity> {
    return this.ordersService.cancel(orderId, user);
  }
}
