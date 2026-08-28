import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('nodeEnv');

  // Swagger UI relies on inline scripts/styles that helmet's default CSP
  // blocks; it is only mounted in development, so relax CSP there too.
  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production' ? undefined : false,
    }),
  );

  app.enableCors({
    origin: configService.get<string[]>('cors.allowedOrigins'),
    credentials: true,
  });

  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (nodeEnv === 'development') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('T-Shirt Store API')
      .setDescription(
        'REST API for the T-shirt store. Covers authentication, catalog ' +
          '(products + variants/SKU), cart, Stripe checkout (Payment Links ' +
          'and Payment Intents), order history with filters, likes, and ' +
          'stock notifications. Specification consistent with the final ' +
          'database schema (`db-schema.md`). Optional features (delivery-person ' +
          'role, `delivered` status, promo codes) are out of scope and ' +
          'deliberately absent from this contract.',
      )
      .setVersion('1.0.0')
      .addTag(
        'Auth',
        'Sign up, sign in, password reset, and email verification.',
      )
      .addTag('Products', 'Product catalog browsing and management.')
      .addTag(
        'Product Variants (SKU)',
        'Size/color/fit/gender variants (SKUs) of a product, including stock and price.',
      )
      .addTag('Product Images', 'Images attached to products and variants.')
      .addTag(
        'Likes',
        "The authenticated user's liked products, under /me/liked-products.",
      )
      .addTag(
        'Cart',
        "The authenticated user's active shopping cart and its items, under /me/cart.",
      )
      .addTag(
        'Checkout',
        'Stripe-based checkout via Payment Links and Payment Intents.',
      )
      .addTag(
        'Orders',
        'Order history and status. Role-polymorphic, so it lives at /orders rather than /me/orders.',
      )
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(configService.get<number>('port') ?? 3000);
}
await bootstrap();
