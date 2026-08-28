export default () => ({
  nodeEnv: process.env.NODE_ENV,
  port: parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: process.env.DATABASE_URL,

  cart: {
    ttlHours: parseInt(process.env.CART_TTL_HOURS ?? '', 10),
  },

  auth: {
    resetTokenTtlHours: parseInt(process.env.RESET_TOKEN_TTL_HOURS ?? '', 10),
    emailVerificationTokenTtlHours: parseInt(
      process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS ?? '',
      10,
    ),
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '', 10),
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
  },

  lowStockThreshold: parseInt(process.env.LOW_STOCK_THRESHOLD ?? '', 10),

  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '', 10),
    resetPasswordTtl: parseInt(
      process.env.THROTTLE_RESET_PASSWORD_TTL ?? '',
      10,
    ),
    resetPasswordLimit: parseInt(
      process.env.THROTTLE_RESET_PASSWORD_LIMIT ?? '',
      10,
    ),
  },

  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT ?? '', 10),
  },

  s3: {
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },

  mailer: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '', 10),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM,
  },
});
