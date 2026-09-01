import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { PoliciesGuard } from '../casl/guards/policies.guard.js';
import { CheckPolicies } from '../casl/decorators/check-policies.decorator.js';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator.js';
import { CheckoutService } from './checkout.service.js';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto.js';
import { PaymentLinkEntity } from './entities/payment-link.entity.js';

@ApiTags('Checkout')
@ApiBearerAuth('bearerAuth')
@Controller('checkout')
@UseGuards(JwtAuthGuard)
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('payment-link')
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Order'))
  @ApiOperation({
    summary:
      'Create a Stripe Payment Link for a single-product purchase (Client)',
    description:
      'Quick purchase of a single product without going through the ' +
      'visible cart. Internally an "invisible" cart is created with that ' +
      'single SKU and the corresponding order in status=pending, along ' +
      'with the Stripe Payment Link.',
  })
  @ApiResponse({
    status: 201,
    description: 'Payment link created',
    type: PaymentLinkEntity,
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiErrorResponses(401, 403, 404, 409)
  createPaymentLink(
    @CurrentUser('sub') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreatePaymentLinkDto,
  ): Promise<PaymentLinkEntity> {
    if (!idempotencyKey || !isUUID(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key header must be a UUID');
    }

    return this.checkoutService.createPaymentLink(userId, idempotencyKey, dto);
  }
}
