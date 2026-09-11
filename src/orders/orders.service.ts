import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { OrderStatus, Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from '../auth/jwt-payload.interface.js';
import type { ListOrdersQueryDto } from './dto/list-orders-query.dto.js';
import type { AdvanceableOrderStatus } from './dto/advance-order-status.dto.js';
import {
  OrderEntity,
  PaymentMethod,
} from '../checkout/entities/order.entity.js';
import { OrderListEntity } from './entities/order-list.entity.js';
import { OrderDetailEntity } from './entities/order-detail.entity.js';

const ALLOWED_STATUS_ADVANCES: Partial<
  Record<OrderStatus, AdvanceableOrderStatus>
> = {
  [OrderStatus.paid]: OrderStatus.processing,
  [OrderStatus.processing]: OrderStatus.shipped,
  [OrderStatus.shipped]: OrderStatus.delivered,
};

const CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.pending,
  OrderStatus.paid,
  OrderStatus.processing,
];

const ASSIGNABLE_STATUSES: OrderStatus[] = [
  OrderStatus.paid,
  OrderStatus.processing,
];

interface OrderRow {
  id: string;
  cartNumber: string;
  userId: string;
  status: string;
  paymentLink: string | null;
  paymentIntent: string | null;
  totalAmount: number;
  deliveryPersonId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    query: ListOrdersQueryDto,
    user: JwtPayload,
  ): Promise<OrderListEntity> {
    const { limit, offset, dateFrom, dateTo, status, minPrice, maxPrice } =
      query;
    const isManager = user.role === Role.manager;
    const isDeliveryPerson = user.role === Role.deliveryPerson;
    const targetUserId = isManager ? query.userId : user.sub;

    const conditions: Prisma.Sql[] = [];
    if (isDeliveryPerson) {
      conditions.push(Prisma.sql`o.delivery_person_id = ${user.sub}::uuid`);
    } else if (targetUserId) {
      conditions.push(Prisma.sql`cn.user_id = ${targetUserId}::uuid`);
    }
    if (dateFrom) {
      conditions.push(Prisma.sql`o.created_at >= ${new Date(dateFrom)}`);
    }
    if (dateTo) {
      conditions.push(Prisma.sql`o.created_at <= ${new Date(dateTo)}`);
    }
    if (status) {
      conditions.push(Prisma.sql`o.status = ${status}::"OrderStatus"`);
    }
    const where = conditions.length
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;

    const havingConditions: Prisma.Sql[] = [];
    if (minPrice !== undefined) {
      havingConditions.push(
        Prisma.sql`COALESCE(SUM(cp.unit_price * cp.quantity), 0) >= ${minPrice}`,
      );
    }
    if (maxPrice !== undefined) {
      havingConditions.push(
        Prisma.sql`COALESCE(SUM(cp.unit_price * cp.quantity), 0) <= ${maxPrice}`,
      );
    }
    const having = havingConditions.length
      ? Prisma.sql`HAVING ${Prisma.join(havingConditions, ' AND ')}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<OrderRow[]>(Prisma.sql`
      SELECT o.order_id AS "id",
             o.cart_number AS "cartNumber",
             cn.user_id AS "userId",
             o.status AS "status",
             o.payment_link AS "paymentLink",
             o.payment_intent AS "paymentIntent",
             o.delivery_person_id AS "deliveryPersonId",
             o.created_at AS "createdAt",
             o.updated_at AS "updatedAt",
             COALESCE(SUM(cp.unit_price * cp.quantity), 0)::float AS "totalAmount"
      FROM orders o
      JOIN cart_numbers cn ON cn.cart_number = o.cart_number
      LEFT JOIN cart_products cp ON cp.cart_number = o.cart_number
      ${where}
      GROUP BY o.order_id, cn.user_id
      ${having}
      ORDER BY o.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const [{ count }] = await this.prisma.$queryRaw<{ count: number }[]>(
      Prisma.sql`
        SELECT COUNT(*)::int AS count FROM (
          SELECT o.order_id
          FROM orders o
          JOIN cart_numbers cn ON cn.cart_number = o.cart_number
          LEFT JOIN cart_products cp ON cp.cart_number = o.cart_number
          ${where}
          GROUP BY o.order_id
          ${having}
        ) sub
      `,
    );

    return new OrderListEntity({
      data: rows.map((row) => ({
        id: row.id,
        cartNumber: row.cartNumber,
        userId: row.userId,
        status: row.status as OrderEntity['status'],
        paymentMethod: row.paymentLink
          ? PaymentMethod.payment_link
          : PaymentMethod.payment_intent,
        totalAmount: row.totalAmount,
        deliveryPersonId: row.deliveryPersonId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      pagination: { limit, offset, total: count },
    });
  }

  async findOne(orderId: string, user: JwtPayload): Promise<OrderDetailEntity> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        cart: {
          include: {
            cartProducts: {
              include: { variant: true },
            },
          },
        },
        deliveryPerson: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (user.role !== Role.manager && order.cart.userId !== user.sub) {
      throw new ForbiddenException('You do not have access to this order');
    }

    const totalAmount = order.cart.cartProducts.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.quantity,
      0,
    );

    return new OrderDetailEntity(
      {
        id: order.id,
        cartNumber: order.cartNumber,
        userId: order.cart.userId,
        status: order.status,
        paymentMethod: order.paymentLink
          ? PaymentMethod.payment_link
          : PaymentMethod.payment_intent,
        totalAmount,
        deliveryPersonId: order.deliveryPersonId,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
      order.cart.cartProducts.map((item) => ({
        skuId: item.skuId,
        variant: {
          productId: item.variant.productId,
          size: item.variant.size,
          color: item.variant.color,
          fit: item.variant.fit,
          gender: item.variant.gender,
        },
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
      })),
      order.deliveryPerson
        ? {
            fullName: order.deliveryPerson.fullName,
            email: order.deliveryPerson.email,
          }
        : null,
    );
  }

  async advanceStatus(
    orderId: string,
    status: AdvanceableOrderStatus,
    user: JwtPayload,
  ): Promise<OrderEntity> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        cart: {
          include: { cartProducts: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (user.role === Role.deliveryPerson) {
      if (order.deliveryPersonId !== user.sub) {
        throw new ForbiddenException('You are not assigned to this order');
      }
      if (status !== OrderStatus.delivered) {
        throw new ForbiddenException(
          'Delivery person can only mark an order as delivered',
        );
      }
    } else if (status === OrderStatus.delivered) {
      throw new ForbiddenException(
        'Only the assigned delivery person can mark an order as delivered',
      );
    }
    if (ALLOWED_STATUS_ADVANCES[order.status] !== status) {
      throw new UnprocessableEntityException('State transition not allowed');
    }
    if (status === OrderStatus.shipped && !order.deliveryPersonId) {
      throw new UnprocessableEntityException(
        'Order must have an assigned delivery person before it can be shipped',
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status },
    });

    const totalAmount = order.cart.cartProducts.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.quantity,
      0,
    );

    return new OrderEntity({
      id: updated.id,
      cartNumber: updated.cartNumber,
      userId: order.cart.userId,
      status: updated.status,
      paymentMethod: updated.paymentLink
        ? PaymentMethod.payment_link
        : PaymentMethod.payment_intent,
      totalAmount,
      deliveryPersonId: updated.deliveryPersonId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  }

  async assignDeliveryPerson(
    orderId: string,
    deliveryPersonId: string,
  ): Promise<OrderEntity> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        cart: {
          include: { cartProducts: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (!ASSIGNABLE_STATUSES.includes(order.status)) {
      throw new UnprocessableEntityException(
        'Order must be paid or processing to assign a delivery person',
      );
    }

    const deliveryPerson = await this.prisma.user.findUnique({
      where: { id: deliveryPersonId },
    });

    if (!deliveryPerson) {
      throw new NotFoundException('Delivery person not found');
    }
    if (
      !deliveryPerson.isActive ||
      deliveryPerson.role !== Role.deliveryPerson
    ) {
      throw new UnprocessableEntityException(
        'User is not an active delivery person',
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { deliveryPersonId },
    });

    const totalAmount = order.cart.cartProducts.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.quantity,
      0,
    );

    return new OrderEntity({
      id: updated.id,
      cartNumber: updated.cartNumber,
      userId: order.cart.userId,
      status: updated.status,
      paymentMethod: updated.paymentLink
        ? PaymentMethod.payment_link
        : PaymentMethod.payment_intent,
      totalAmount,
      deliveryPersonId: updated.deliveryPersonId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  }

  async cancel(orderId: string, user: JwtPayload): Promise<OrderEntity> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        cart: {
          include: { cartProducts: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.cart.userId !== user.sub) {
      throw new ForbiddenException('You do not have access to this order');
    }
    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      const reason =
        order.status === OrderStatus.cancelled
          ? 'already cancelled'
          : order.status === OrderStatus.delivered
            ? 'already delivered'
            : 'already shipped';
      throw new UnprocessableEntityException(
        `The order is ${reason} and cannot be cancelled`,
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.cancelled },
    });

    const totalAmount = order.cart.cartProducts.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.quantity,
      0,
    );

    return new OrderEntity({
      id: updated.id,
      cartNumber: updated.cartNumber,
      userId: order.cart.userId,
      status: updated.status,
      paymentMethod: updated.paymentLink
        ? PaymentMethod.payment_link
        : PaymentMethod.payment_intent,
      totalAmount,
      deliveryPersonId: updated.deliveryPersonId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  }
}
