import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator.js';
import { WebhooksService } from './webhooks.service.js';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('stripe')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Handle a Stripe event (Stripe)',
    description:
      'Called by Stripe, authenticated by the Stripe-Signature header ' +
      'instead of a bearer token. Acknowledges every event with 200, ' +
      'including ignored types, so Stripe does not retry them forever.',
  })
  @ApiHeader({
    name: 'Stripe-Signature',
    required: true,
    schema: { type: 'string' },
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['id', 'type', 'data'],
      properties: {
        id: { type: 'string' },
        type: { type: 'string' },
        data: {
          type: 'object',
          required: ['object'],
          properties: {
            object: { type: 'object' },
          },
        },
      },
    },
  })
  @ApiErrorResponses(400)
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<void> {
    if (!signature || !req.rawBody) {
      throw new BadRequestException('Missing Stripe-Signature header');
    }

    await this.webhooksService.handleStripeEvent(req.rawBody, signature);
  }
}
