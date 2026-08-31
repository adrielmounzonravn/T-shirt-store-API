import { describe, expect, it } from 'vitest';
import { envValidationSchema } from './env.validation.js';

const validEnv = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',

  CART_TTL_HOURS: '48',
  RESET_TOKEN_TTL_HOURS: '1',
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: '24',
  LOW_STOCK_THRESHOLD: '3',
  BCRYPT_SALT_ROUNDS: '10',

  JWT_SECRET: 'secret',
  JWT_EXPIRES_IN: '1h',

  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',

  THROTTLE_TTL: '60',
  THROTTLE_LIMIT: '20',
  THROTTLE_RESET_PASSWORD_TTL: '60',
  THROTTLE_RESET_PASSWORD_LIMIT: '5',

  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',

  QUEUE_JOB_ATTEMPTS: '3',
  QUEUE_JOB_BACKOFF_DELAY_MS: '2000',

  STRIPE_SUCCESS_URL: 'http://localhost:3000/checkout/success',
  STRIPE_CANCEL_URL: 'http://localhost:3000/checkout/cancel',
  STRIPE_CURRENCY: 'usd',

  S3_BUCKET: 'bucket',
  S3_REGION: 'us-east-1',

  SMTP_PORT: '587',
  SMTP_FROM: 'T-shirt Store <no-reply@tshirtstore.dev>',
};

describe('envValidationSchema', () => {
  it('accepts a fully populated valid env', () => {
    const { error } = envValidationSchema.validate(validEnv, {
      abortEarly: false,
    });

    expect(error).toBeUndefined();
  });

  it('defaults NODE_ENV and PORT when omitted', () => {
    const rest: Record<string, string> = { ...validEnv };
    delete rest.NODE_ENV;
    delete rest.PORT;

    const { error, value } = envValidationSchema.validate(rest, {
      abortEarly: false,
    }) as { error?: Error; value: { NODE_ENV: string; PORT: number } };

    expect(error).toBeUndefined();
    expect(value.NODE_ENV).toBe('development');
    expect(value.PORT).toBe(3000);
  });

  it('allows S3 credentials and SMTP auth to be blank', () => {
    const { error } = envValidationSchema.validate(
      {
        ...validEnv,
        S3_ACCESS_KEY_ID: '',
        S3_SECRET_ACCESS_KEY: '',
        SMTP_HOST: '',
        SMTP_USER: '',
        SMTP_PASSWORD: '',
      },
      { abortEarly: false },
    );

    expect(error).toBeUndefined();
  });

  it('fails when a required domain setting is missing', () => {
    const rest: Record<string, string> = { ...validEnv };
    delete rest.JWT_SECRET;

    const { error } = envValidationSchema.validate(rest, {
      abortEarly: false,
    });

    expect(error?.message).toContain('JWT_SECRET');
  });

  it('fails when DATABASE_URL is not a postgres connection string', () => {
    const { error } = envValidationSchema.validate(
      { ...validEnv, DATABASE_URL: 'mysql://user:pass@localhost:3306/db' },
      { abortEarly: false },
    );

    expect(error?.message).toContain('DATABASE_URL');
  });

  it('reports every missing required setting at once', () => {
    const { error } = envValidationSchema.validate(
      { NODE_ENV: 'development' },
      { abortEarly: false },
    );

    expect(error?.details.length).toBeGreaterThan(1);
  });
});
