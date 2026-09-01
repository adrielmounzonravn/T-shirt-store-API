import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
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
import { OrderListEntity } from './entities/order-list.entity.js';
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
}
