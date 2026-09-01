import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import type { Provider } from '@nestjs/common';

export const STRIPE_CLIENT = 'STRIPE_CLIENT';

export const stripeClientProvider: Provider = {
  provide: STRIPE_CLIENT,
  useFactory: (config: ConfigService): Stripe => {
    const secretKey = config.get<string>('stripe.secretKey');
    return new Stripe(secretKey || 'sk_test_placeholder');
  },
  inject: [ConfigService],
};
