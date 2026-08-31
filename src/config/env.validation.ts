import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),

  CART_TTL_HOURS: Joi.number().required(),
  RESET_TOKEN_TTL_HOURS: Joi.number().required(),
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: Joi.number().required(),
  LOW_STOCK_THRESHOLD: Joi.number().required(),
  BCRYPT_SALT_ROUNDS: Joi.number().required(),

  JWT_SECRET: Joi.string().min(1).required(),
  JWT_EXPIRES_IN: Joi.string().required(),

  CORS_ALLOWED_ORIGINS: Joi.string().required(),

  THROTTLE_TTL: Joi.number().required(),
  THROTTLE_LIMIT: Joi.number().required(),
  THROTTLE_RESET_PASSWORD_TTL: Joi.number().required(),
  THROTTLE_RESET_PASSWORD_LIMIT: Joi.number().required(),

  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().required(),

  QUEUE_JOB_ATTEMPTS: Joi.number().required(),
  QUEUE_JOB_BACKOFF_DELAY_MS: Joi.number().required(),

  STRIPE_SECRET_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  STRIPE_WEBHOOK_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  STRIPE_SUCCESS_URL: Joi.string().uri().required(),
  STRIPE_CANCEL_URL: Joi.string().uri().required(),
  STRIPE_CURRENCY: Joi.string().lowercase().required(),

  S3_BUCKET: Joi.string().required(),
  S3_REGION: Joi.string().required(),
  S3_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  S3_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),

  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().required(),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASSWORD: Joi.string().allow('').optional(),
  SMTP_FROM: Joi.string().required(),
}).unknown(true);
