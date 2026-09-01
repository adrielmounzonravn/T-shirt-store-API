import { Module } from '@nestjs/common';
import {
  stripeClientProvider,
  STRIPE_CLIENT,
} from './stripe-client.provider.js';

@Module({
  providers: [stripeClientProvider],
  exports: [STRIPE_CLIENT],
})
export class StripeModule {}
