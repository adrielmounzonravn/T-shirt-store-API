import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { CartStatus, ProductStatus } from '../generated/prisma/enums.js';
import type { CartProduct, Order } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { STRIPE_CLIENT } from '../stripe/stripe-client.provider.js';
import type { CreatePaymentLinkDto } from './dto/create-payment-link.dto.js';
import { OrderEntity, PaymentMethod } from './entities/order.entity.js';
import { PaymentIntentEntity } from './entities/payment-intent.entity.js';
import { PaymentLinkEntity } from './entities/payment-link.entity.js';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
  ) {}

  async createPaymentLink(
    userId: string,
    idempotencyKey: string,
    dto: CreatePaymentLinkDto,
  ): Promise<PaymentLinkEntity> {
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey },
      include: { cart: true },
    });

    if (existing && existing.cart.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    if (existing?.paymentLink) {
      return this.buildResponse(existing, existing.paymentLink, userId);
    }

    const order =
      existing ?? (await this.createPendingOrder(userId, idempotencyKey, dto));

    const paymentLink = await this.createStripePaymentLink(order, dto);

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { paymentLink },
    });

    return this.buildResponse(updated, paymentLink, userId);
  }

  private async createPendingOrder(
    userId: string,
    idempotencyKey: string,
    dto: CreatePaymentLinkDto,
  ): Promise<Order> {
    const variant = await this.findSellableVariant(dto.skuId);

    if (dto.quantity > variant.stock) {
      throw new ConflictException(
        'Insufficient stock for the requested quantity',
      );
    }

    const ttlHours = this.configService.getOrThrow<number>('cart.ttlHours');

    return this.prisma.$transaction(async (tx) => {
      const cart = await tx.cartNumber.create({
        data: {
          userId,
          status: CartStatus.confirmed,
          expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
        },
      });

      await tx.cartProduct.create({
        data: {
          cartNumber: cart.cartNumber,
          skuId: dto.skuId,
          quantity: dto.quantity,
          unitPrice: variant.price,
        },
      });

      return tx.order.create({
        data: { cartNumber: cart.cartNumber, idempotencyKey },
      });
    });
  }

  private async createStripePaymentLink(
    order: Order,
    dto: CreatePaymentLinkDto,
  ): Promise<string> {
    const variant = await this.prisma.productVariant.findUniqueOrThrow({
      where: { id: dto.skuId },
      include: { product: true },
    });

    const currency = this.configService.getOrThrow<string>('stripe.currency');
    const successUrl =
      this.configService.getOrThrow<string>('stripe.successUrl');

    const price = await this.stripe.prices.create({
      currency,
      unit_amount: Math.round(Number(variant.price) * 100),
      product_data: {
        name: `${variant.product.name} (${variant.size}/${variant.color})`,
      },
    });

    const link = await this.stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: dto.quantity }],
      metadata: { orderId: order.id },
      after_completion: { type: 'redirect', redirect: { url: successUrl } },
    });

    return link.url;
  }

  async createPaymentIntent(
    userId: string,
    idempotencyKey: string,
  ): Promise<PaymentIntentEntity> {
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey },
      include: { cart: true },
    });

    if (existing && existing.cart.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    if (existing?.paymentIntent) {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(
        existing.paymentIntent,
      );
      return this.buildPaymentIntentResponse(
        existing,
        paymentIntent.client_secret ?? '',
        userId,
      );
    }

    const order =
      existing ??
      (await this.createOrderFromActiveCart(userId, idempotencyKey));

    const totalAmount = await this.getOrderTotal(order.cartNumber);
    const paymentIntent = await this.createStripePaymentIntent(
      order,
      totalAmount,
    );

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { paymentIntent: paymentIntent.id },
    });

    return this.buildPaymentIntentResponse(
      updated,
      paymentIntent.client_secret ?? '',
      userId,
    );
  }

  private async createOrderFromActiveCart(
    userId: string,
    idempotencyKey: string,
  ): Promise<Order> {
    await this.prisma.cartNumber.updateMany({
      where: {
        userId,
        status: CartStatus.active,
        expiresAt: { lt: new Date() },
      },
      data: { status: CartStatus.expired },
    });

    const cart = await this.prisma.cartNumber.findFirst({
      where: { userId, status: CartStatus.active },
      include: { cartProducts: true },
    });

    if (!cart || cart.cartProducts.length === 0) {
      throw new UnprocessableEntityException('Cart is empty');
    }

    const prices = await this.priceCartItems(cart.cartProducts);

    return this.prisma.$transaction(async (tx) => {
      await Promise.all(
        prices.map(({ skuId, price }) =>
          tx.cartProduct.update({
            where: { cartNumber_skuId: { cartNumber: cart.cartNumber, skuId } },
            data: { unitPrice: price },
          }),
        ),
      );

      await tx.cartNumber.update({
        where: { cartNumber: cart.cartNumber },
        data: { status: CartStatus.confirmed },
      });

      return tx.order.create({
        data: { cartNumber: cart.cartNumber, idempotencyKey },
      });
    });
  }

  private async priceCartItems(
    cartProducts: CartProduct[],
  ): Promise<{ skuId: string; price: number }[]> {
    return Promise.all(
      cartProducts.map(async ({ skuId, quantity }) => {
        const variant = await this.prisma.productVariant.findFirst({
          where: {
            id: skuId,
            deletedAt: null,
            status: ProductStatus.enabled,
            product: { deletedAt: null, status: ProductStatus.enabled },
          },
        });

        if (!variant || quantity > variant.stock) {
          throw new ConflictException(
            'Insufficient stock for one or more cart items',
          );
        }

        return { skuId, price: Number(variant.price) };
      }),
    );
  }

  private async getOrderTotal(cartNumber: string): Promise<number> {
    const cartProducts = await this.prisma.cartProduct.findMany({
      where: { cartNumber },
    });

    return cartProducts.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.quantity,
      0,
    );
  }

  private async createStripePaymentIntent(
    order: Order,
    totalAmount: number,
  ): Promise<Stripe.PaymentIntent> {
    const currency = this.configService.getOrThrow<string>('stripe.currency');

    return this.stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100),
      currency,
      metadata: { orderId: order.id },
    });
  }

  private async buildPaymentIntentResponse(
    order: Order,
    clientSecret: string,
    userId: string,
  ): Promise<PaymentIntentEntity> {
    const totalAmount = await this.getOrderTotal(order.cartNumber);

    return new PaymentIntentEntity({
      order: new OrderEntity({
        id: order.id,
        cartNumber: order.cartNumber,
        userId,
        status: order.status,
        paymentMethod: PaymentMethod.payment_intent,
        totalAmount,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      }),
      clientSecret,
    });
  }

  private async findSellableVariant(skuId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: skuId,
        deletedAt: null,
        status: ProductStatus.enabled,
        product: { deletedAt: null, status: ProductStatus.enabled },
      },
    });

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    return variant;
  }

  private async buildResponse(
    order: Order,
    paymentLink: string,
    userId: string,
  ): Promise<PaymentLinkEntity> {
    const cartProducts = await this.prisma.cartProduct.findMany({
      where: { cartNumber: order.cartNumber },
    });

    const totalAmount = cartProducts.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.quantity,
      0,
    );

    return new PaymentLinkEntity({
      order: new OrderEntity({
        id: order.id,
        cartNumber: order.cartNumber,
        userId,
        status: order.status,
        paymentMethod: PaymentMethod.payment_link,
        totalAmount,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      }),
      paymentLink,
    });
  }
}
