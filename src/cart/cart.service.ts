import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CartStatus, ProductStatus } from '../generated/prisma/enums.js';
import type { CartNumber } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AddCartItemDto } from './dto/add-cart-item.dto.js';
import type { UpdateCartItemDto } from './dto/update-cart-item.dto.js';
import { CartEntity } from './entities/cart.entity.js';

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getCart(userId: string): Promise<CartEntity> {
    const cart = await this.getOrCreateActiveCart(userId);
    return this.loadCart(cart.cartNumber);
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartEntity> {
    const cart = await this.getOrCreateActiveCart(userId);
    const variant = await this.findSellableVariant(dto.skuId);

    const existing = await this.prisma.cartProduct.findUnique({
      where: {
        cartNumber_skuId: { cartNumber: cart.cartNumber, skuId: dto.skuId },
      },
    });

    const quantity = (existing?.quantity ?? 0) + dto.quantity;

    if (quantity > variant.stock) {
      throw new ConflictException(
        'Insufficient stock for the requested quantity',
      );
    }

    await this.prisma.cartProduct.upsert({
      where: {
        cartNumber_skuId: { cartNumber: cart.cartNumber, skuId: dto.skuId },
      },
      create: { cartNumber: cart.cartNumber, skuId: dto.skuId, quantity },
      update: { quantity },
    });

    return this.loadCart(cart.cartNumber);
  }

  async updateItem(
    userId: string,
    skuId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartEntity> {
    const cart = await this.getOrCreateActiveCart(userId);

    const existing = await this.prisma.cartProduct.findUnique({
      where: { cartNumber_skuId: { cartNumber: cart.cartNumber, skuId } },
    });

    if (!existing) {
      throw new NotFoundException('SKU not found in the active cart');
    }

    const variant = await this.prisma.productVariant.findUniqueOrThrow({
      where: { id: skuId },
    });

    if (dto.quantity > variant.stock) {
      throw new ConflictException(
        'Insufficient stock for the requested quantity',
      );
    }

    await this.prisma.cartProduct.update({
      where: { cartNumber_skuId: { cartNumber: cart.cartNumber, skuId } },
      data: { quantity: dto.quantity },
    });

    return this.loadCart(cart.cartNumber);
  }

  async removeItem(userId: string, skuId: string): Promise<CartEntity> {
    const cart = await this.getOrCreateActiveCart(userId);

    const existing = await this.prisma.cartProduct.findUnique({
      where: { cartNumber_skuId: { cartNumber: cart.cartNumber, skuId } },
    });

    if (!existing) {
      throw new NotFoundException('SKU not found in the active cart');
    }

    await this.prisma.cartProduct.delete({
      where: { cartNumber_skuId: { cartNumber: cart.cartNumber, skuId } },
    });

    return this.loadCart(cart.cartNumber);
  }

  private async getOrCreateActiveCart(userId: string): Promise<CartNumber> {
    await this.prisma.cartNumber.updateMany({
      where: {
        userId,
        status: CartStatus.active,
        expiresAt: { lt: new Date() },
      },
      data: { status: CartStatus.expired },
    });

    const activeCart = await this.prisma.cartNumber.findFirst({
      where: { userId, status: CartStatus.active },
    });

    if (activeCart) {
      return activeCart;
    }

    const ttlHours = this.configService.getOrThrow<number>('cart.ttlHours');

    return this.prisma.cartNumber.create({
      data: {
        userId,
        expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
      },
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

  private async loadCart(cartNumber: string): Promise<CartEntity> {
    const cart = await this.prisma.cartNumber.findUniqueOrThrow({
      where: { cartNumber },
      include: {
        cartProducts: {
          include: { variant: { include: { images: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return new CartEntity({
      cartNumber: cart.cartNumber,
      status: cart.status,
      expiresAt: cart.expiresAt,
      items: cart.cartProducts.map((cartProduct) => ({
        skuId: cartProduct.skuId,
        variant: cartProduct.variant,
        quantity: cartProduct.quantity,
        unitPrice: cartProduct.unitPrice,
      })),
    });
  }
}
