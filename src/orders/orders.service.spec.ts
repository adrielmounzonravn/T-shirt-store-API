import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrderStatus, Role } from '../generated/prisma/enums.js';
import type { ListOrdersQueryDto } from './dto/list-orders-query.dto.js';
import type { JwtPayload } from '../auth/jwt-payload.interface.js';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: { $queryRaw: ReturnType<typeof vi.fn> };

  const clientUserId = 'client-1';
  const otherUserId = 'other-user-1';
  const now = new Date('2024-06-01T00:00:00.000Z');

  const clientUser: JwtPayload = { sub: clientUserId, role: Role.client };
  const managerUser: JwtPayload = { sub: 'manager-1', role: Role.manager };
  const deliveryUser: JwtPayload = {
    sub: 'delivery-1',
    role: Role.deliveryPerson,
  };
  const otherDeliveryUser: JwtPayload = {
    sub: 'delivery-2',
    role: Role.deliveryPerson,
  };

  const baseQuery = (
    overrides: Partial<ListOrdersQueryDto> = {},
  ): ListOrdersQueryDto => ({
    limit: 20,
    offset: 0,
    ...overrides,
  });

  const makeOrderRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'order-1',
    cartNumber: 'cart-1',
    userId: clientUserId,
    status: OrderStatus.pending,
    paymentLink: 'https://buy.stripe.com/test',
    paymentIntent: null,
    totalAmount: 51,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  const allCallArgsAsString = (mock: ReturnType<typeof vi.fn>) =>
    mock.mock.calls.map((call) => JSON.stringify(call)).join(' | ');

  beforeEach(async () => {
    prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([makeOrderRow()])
        .mockResolvedValueOnce([{ count: 1 }]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [OrdersService, PrismaService],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    service = moduleRef.get(OrdersService);
  });

  describe('role-based scoping', () => {
    it('ignores query.userId for a client and scopes to the client own id', async () => {
      await service.findMany(baseQuery({ userId: otherUserId }), clientUser);

      const argsString = allCallArgsAsString(prisma.$queryRaw);
      expect(argsString).toContain(clientUserId);
      expect(argsString).not.toContain(otherUserId);
    });

    it('does not scope to a single user for a manager with no userId filter', async () => {
      await service.findMany(baseQuery(), managerUser);

      const argsString = allCallArgsAsString(prisma.$queryRaw);
      expect(argsString).not.toContain(managerUser.sub);
      expect(argsString).not.toContain(clientUserId);
    });

    it('scopes to the given userId for a manager with a userId filter', async () => {
      await service.findMany(baseQuery({ userId: otherUserId }), managerUser);

      const argsString = allCallArgsAsString(prisma.$queryRaw);
      expect(argsString).toContain(otherUserId);
    });

    it('scopes a delivery person to orders assigned to them', async () => {
      await service.findMany(baseQuery(), deliveryUser);

      const argsString = allCallArgsAsString(prisma.$queryRaw);
      expect(argsString).toContain(deliveryUser.sub);
    });

    it('ignores query.userId for a delivery person and scopes to their own id', async () => {
      await service.findMany(baseQuery({ userId: otherUserId }), deliveryUser);

      const argsString = allCallArgsAsString(prisma.$queryRaw);
      expect(argsString).toContain(deliveryUser.sub);
      expect(argsString).not.toContain(otherUserId);
    });

    it('scopes two different delivery persons to their own distinct id', async () => {
      await service.findMany(baseQuery(), deliveryUser);
      const firstArgsString = allCallArgsAsString(prisma.$queryRaw);
      expect(firstArgsString).toContain(deliveryUser.sub);
      expect(firstArgsString).not.toContain(otherDeliveryUser.sub);

      prisma.$queryRaw = vi
        .fn()
        .mockResolvedValueOnce([makeOrderRow()])
        .mockResolvedValueOnce([{ count: 1 }]);
      const moduleRef = await Test.createTestingModule({
        providers: [OrdersService, PrismaService],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile();
      service = moduleRef.get(OrdersService);

      await service.findMany(baseQuery(), otherDeliveryUser);
      const secondArgsString = allCallArgsAsString(prisma.$queryRaw);
      expect(secondArgsString).toContain(otherDeliveryUser.sub);
      expect(secondArgsString).not.toContain(deliveryUser.sub);
    });

    it('ignores a query.userId matching another delivery person and does not leak it into the args', async () => {
      await service.findMany(
        baseQuery({ userId: otherDeliveryUser.sub }),
        deliveryUser,
      );

      const argsString = allCallArgsAsString(prisma.$queryRaw);
      expect(argsString).toContain(deliveryUser.sub);
      expect(argsString).not.toContain(otherDeliveryUser.sub);
    });
  });

  describe('filters', () => {
    it('passes dateFrom through to the query', async () => {
      const dateFrom = '2024-01-01T00:00:00.000Z';
      await service.findMany(baseQuery({ dateFrom }), managerUser);

      expect(allCallArgsAsString(prisma.$queryRaw)).toContain('2024-01-01');
    });

    it('passes dateTo through to the query', async () => {
      const dateTo = '2024-12-31T00:00:00.000Z';
      await service.findMany(baseQuery({ dateTo }), managerUser);

      expect(allCallArgsAsString(prisma.$queryRaw)).toContain('2024-12-31');
    });

    it('passes status through to the query', async () => {
      await service.findMany(
        baseQuery({ status: OrderStatus.shipped }),
        managerUser,
      );

      expect(allCallArgsAsString(prisma.$queryRaw)).toContain('shipped');
    });

    it('passes minPrice through to the query', async () => {
      await service.findMany(baseQuery({ minPrice: 42 }), managerUser);

      expect(allCallArgsAsString(prisma.$queryRaw)).toContain('42');
    });

    it('passes maxPrice through to the query', async () => {
      await service.findMany(baseQuery({ maxPrice: 999 }), managerUser);

      expect(allCallArgsAsString(prisma.$queryRaw)).toContain('999');
    });

    it('combines all filters together', async () => {
      const dateFrom = '2024-01-01T00:00:00.000Z';
      const dateTo = '2024-12-31T00:00:00.000Z';
      await service.findMany(
        baseQuery({
          dateFrom,
          dateTo,
          status: OrderStatus.paid,
          minPrice: 10,
          maxPrice: 100,
          userId: otherUserId,
        }),
        managerUser,
      );

      const argsString = allCallArgsAsString(prisma.$queryRaw);
      expect(argsString).toContain('2024-01-01');
      expect(argsString).toContain('2024-12-31');
      expect(argsString).toContain('paid');
      expect(argsString).toContain('10');
      expect(argsString).toContain('100');
      expect(argsString).toContain(otherUserId);
    });

    it('works with no filters at all and still returns paginated results', async () => {
      const result = await service.findMany(baseQuery(), managerUser);

      expect(result.data).toHaveLength(1);
      expect(result.pagination).toEqual({ limit: 20, offset: 0, total: 1 });
    });
  });

  describe('deliveryPersonId filter', () => {
    const deliveryPersonId = 'delivery-99';

    it('scopes to the given deliveryPersonId for a manager with a deliveryPersonId filter', async () => {
      await service.findMany(baseQuery({ deliveryPersonId }), managerUser);

      const argsString = allCallArgsAsString(prisma.$queryRaw);
      expect(argsString).toContain(deliveryPersonId);
    });

    it('does not scope by delivery person for a manager with no deliveryPersonId filter', async () => {
      await service.findMany(baseQuery(), managerUser);

      const argsString = allCallArgsAsString(prisma.$queryRaw);
      expect(argsString).not.toContain(deliveryPersonId);
    });

    it('ignores query.deliveryPersonId for a client and scopes to the client own id', async () => {
      await service.findMany(
        baseQuery({ deliveryPersonId }),
        clientUser,
      );

      const argsString = allCallArgsAsString(prisma.$queryRaw);
      expect(argsString).toContain(clientUserId);
      expect(argsString).not.toContain(deliveryPersonId);
    });

    it('ignores query.deliveryPersonId for a delivery person and scopes to their own assigned id', async () => {
      await service.findMany(
        baseQuery({ deliveryPersonId: otherDeliveryUser.sub }),
        deliveryUser,
      );

      const argsString = allCallArgsAsString(prisma.$queryRaw);
      expect(argsString).toContain(deliveryUser.sub);
      expect(argsString).not.toContain(otherDeliveryUser.sub);
    });

    it('combines userId and deliveryPersonId filters together for a manager', async () => {
      await service.findMany(
        baseQuery({ userId: otherUserId, deliveryPersonId }),
        managerUser,
      );

      const argsString = allCallArgsAsString(prisma.$queryRaw);
      expect(argsString).toContain(otherUserId);
      expect(argsString).toContain(deliveryPersonId);
    });
  });

  describe('payment method derivation', () => {
    it('derives payment_link when paymentLink is set', async () => {
      prisma.$queryRaw = vi
        .fn()
        .mockResolvedValueOnce([
          makeOrderRow({
            paymentLink: 'https://buy.stripe.com/x',
            paymentIntent: null,
          }),
        ])
        .mockResolvedValueOnce([{ count: 1 }]);

      const moduleRef = await Test.createTestingModule({
        providers: [OrdersService, PrismaService],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile();
      service = moduleRef.get(OrdersService);

      const result = await service.findMany(baseQuery(), managerUser);

      expect(result.data[0].paymentMethod).toBe('payment_link');
    });

    it('derives payment_intent when paymentLink is null', async () => {
      prisma.$queryRaw = vi
        .fn()
        .mockResolvedValueOnce([
          makeOrderRow({ paymentLink: null, paymentIntent: 'pi_123' }),
        ])
        .mockResolvedValueOnce([{ count: 1 }]);

      const moduleRef = await Test.createTestingModule({
        providers: [OrdersService, PrismaService],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile();
      service = moduleRef.get(OrdersService);

      const result = await service.findMany(baseQuery(), managerUser);

      expect(result.data[0].paymentMethod).toBe('payment_intent');
    });
  });

  describe('response shape', () => {
    it('maps raw rows into OrderEntity fields', async () => {
      const result = await service.findMany(baseQuery(), managerUser);

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          orderId: 'order-1',
          cartNumber: 'cart-1',
          userId: clientUserId,
          status: OrderStatus.pending,
          totalAmount: 51,
          createdAt: now,
          updatedAt: now,
        }),
      );
    });

    it('reflects the count query total independent of the page size', async () => {
      prisma.$queryRaw = vi
        .fn()
        .mockResolvedValueOnce([makeOrderRow()])
        .mockResolvedValueOnce([{ count: 57 }]);

      const moduleRef = await Test.createTestingModule({
        providers: [OrdersService, PrismaService],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile();
      service = moduleRef.get(OrdersService);

      const result = await service.findMany(
        baseQuery({ limit: 1 }),
        managerUser,
      );

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(57);
    });

    it('returns an empty page without throwing when there are no matching orders', async () => {
      prisma.$queryRaw = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]);

      const moduleRef = await Test.createTestingModule({
        providers: [OrdersService, PrismaService],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile();
      service = moduleRef.get(OrdersService);

      const result = await service.findMany(baseQuery(), managerUser);

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('deliveryPersonId on findMany rows', () => {
    it('reflects a null deliveryPersonId when the order has no assignment', async () => {
      prisma.$queryRaw = vi
        .fn()
        .mockResolvedValueOnce([makeOrderRow({ deliveryPersonId: null })])
        .mockResolvedValueOnce([{ count: 1 }]);

      const moduleRef = await Test.createTestingModule({
        providers: [OrdersService, PrismaService],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile();
      service = moduleRef.get(OrdersService);

      const result = await service.findMany(baseQuery(), managerUser);

      expect(result.data[0].deliveryPersonId).toBeNull();
    });

    it('reflects the assigned deliveryPersonId when the order has an assignment', async () => {
      const deliveryPersonId = 'delivery-1';
      prisma.$queryRaw = vi
        .fn()
        .mockResolvedValueOnce([makeOrderRow({ deliveryPersonId })])
        .mockResolvedValueOnce([{ count: 1 }]);

      const moduleRef = await Test.createTestingModule({
        providers: [OrdersService, PrismaService],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile();
      service = moduleRef.get(OrdersService);

      const result = await service.findMany(baseQuery(), managerUser);

      expect(result.data[0].deliveryPersonId).toBe(deliveryPersonId);
    });

    it('keeps distinct deliveryPersonId values across rows on the same page', async () => {
      const deliveryPersonId = 'delivery-1';
      prisma.$queryRaw = vi
        .fn()
        .mockResolvedValueOnce([
          makeOrderRow({ id: 'order-1', deliveryPersonId }),
          makeOrderRow({ id: 'order-2', deliveryPersonId: null }),
        ])
        .mockResolvedValueOnce([{ count: 2 }]);

      const moduleRef = await Test.createTestingModule({
        providers: [OrdersService, PrismaService],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile();
      service = moduleRef.get(OrdersService);

      const result = await service.findMany(baseQuery(), managerUser);

      expect(result.data).toHaveLength(2);
      expect(result.data[0].deliveryPersonId).toBe(deliveryPersonId);
      expect(result.data[1].deliveryPersonId).toBeNull();
    });

    it('still applies filters correctly alongside the new deliveryPersonId field', async () => {
      const deliveryPersonId = 'delivery-1';
      prisma.$queryRaw = vi
        .fn()
        .mockResolvedValueOnce([
          makeOrderRow({ status: OrderStatus.shipped, deliveryPersonId }),
        ])
        .mockResolvedValueOnce([{ count: 1 }]);

      const moduleRef = await Test.createTestingModule({
        providers: [OrdersService, PrismaService],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile();
      service = moduleRef.get(OrdersService);

      const result = await service.findMany(
        baseQuery({ status: OrderStatus.shipped }),
        managerUser,
      );

      expect(result.data[0].status).toBe(OrderStatus.shipped);
      expect(result.data[0].deliveryPersonId).toBe(deliveryPersonId);
    });

    it('does not expose a nested delivery person object on list rows', async () => {
      const deliveryPersonId = 'delivery-1';
      prisma.$queryRaw = vi
        .fn()
        .mockResolvedValueOnce([makeOrderRow({ deliveryPersonId })])
        .mockResolvedValueOnce([{ count: 1 }]);

      const moduleRef = await Test.createTestingModule({
        providers: [OrdersService, PrismaService],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile();
      service = moduleRef.get(OrdersService);

      const result = await service.findMany(baseQuery(), managerUser);

      expect(result.data[0]).not.toHaveProperty('deliveryPerson');
    });
  });

  describe('findOne', () => {
    const orderId = 'order-1';

    const makeVariant = (overrides: Record<string, unknown> = {}) => ({
      productId: 'product-1',
      size: 'M',
      color: 'black',
      fit: 'regular',
      gender: 'unisex',
      ...overrides,
    });

    const makeCartProduct = (overrides: Record<string, unknown> = {}) => ({
      skuId: 'sku-1',
      quantity: 2,
      unitPrice: 25.5,
      variant: makeVariant(),
      ...overrides,
    });

    const makeOrderWithCart = (
      overrides: Record<string, unknown> = {},
      cartOverrides: Record<string, unknown> = {},
      cartProducts: Record<string, unknown>[] = [makeCartProduct()],
    ) => ({
      id: orderId,
      cartNumber: 'cart-1',
      status: OrderStatus.pending,
      paymentLink: 'https://buy.stripe.com/test',
      paymentIntent: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
      cart: {
        userId: clientUserId,
        cartProducts,
        ...cartOverrides,
      },
    });

    const setupFindUnique = async (
      returnValue: Record<string, unknown> | null,
    ) => {
      const findOnePrisma = {
        order: { findUnique: vi.fn().mockResolvedValue(returnValue) },
      };

      const moduleRef = await Test.createTestingModule({
        providers: [OrdersService, PrismaService],
      })
        .overrideProvider(PrismaService)
        .useValue(findOnePrisma)
        .compile();

      return {
        service: moduleRef.get(OrdersService),
        prisma: findOnePrisma,
      };
    };

    it('throws NotFoundException when no order exists with the given id', async () => {
      const { service } = await setupFindUnique(null);

      await expect(service.findOne(orderId, clientUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when a client requests an order they do not own', async () => {
      const { service } = await setupFindUnique(
        makeOrderWithCart({}, { userId: otherUserId }),
      );

      await expect(service.findOne(orderId, clientUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns the order for a client who owns it', async () => {
      const { service } = await setupFindUnique(
        makeOrderWithCart({}, { userId: clientUserId }),
      );

      const result = await service.findOne(orderId, clientUser);

      expect(result.orderId).toBe(orderId);
      expect(result.userId).toBe(clientUserId);
    });

    it('allows a manager to access an order owned by another user', async () => {
      const { service } = await setupFindUnique(
        makeOrderWithCart({}, { userId: otherUserId }),
      );

      const result = await service.findOne(orderId, managerUser);

      expect(result.orderId).toBe(orderId);
      expect(result.userId).toBe(otherUserId);
    });

    it('derives payment_link when paymentLink is set', async () => {
      const { service } = await setupFindUnique(
        makeOrderWithCart({
          paymentLink: 'https://buy.stripe.com/x',
          paymentIntent: null,
        }),
      );

      const result = await service.findOne(orderId, managerUser);

      expect(result.paymentMethod).toBe('payment_link');
    });

    it('derives payment_intent when paymentLink is null', async () => {
      const { service } = await setupFindUnique(
        makeOrderWithCart({ paymentLink: null, paymentIntent: 'pi_123' }),
      );

      const result = await service.findOne(orderId, managerUser);

      expect(result.paymentMethod).toBe('payment_intent');
    });

    it('computes totalAmount and lineTotal from unitPrice * quantity across items', async () => {
      const { service } = await setupFindUnique(
        makeOrderWithCart({}, {}, [
          makeCartProduct({ skuId: 'sku-1', quantity: 2, unitPrice: 25.5 }),
          makeCartProduct({ skuId: 'sku-2', quantity: 3, unitPrice: 10 }),
        ]),
      );

      const result = await service.findOne(orderId, managerUser);

      expect(result.totalAmount).toBe(25.5 * 2 + 10 * 3);
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          skuId: 'sku-1',
          quantity: 2,
          unitPrice: 25.5,
          lineTotal: 51,
        }),
      );
      expect(result.items[1]).toEqual(
        expect.objectContaining({
          skuId: 'sku-2',
          quantity: 3,
          unitPrice: 10,
          lineTotal: 30,
        }),
      );
    });

    it('includes variant details for each item', async () => {
      const { service } = await setupFindUnique(
        makeOrderWithCart({}, {}, [
          makeCartProduct({
            variant: makeVariant({
              productId: 'product-42',
              size: 'L',
              color: 'red',
              fit: 'slim',
              gender: 'male',
            }),
          }),
        ]),
      );

      const result = await service.findOne(orderId, managerUser);

      expect(result.items[0].variant).toEqual({
        productId: 'product-42',
        size: 'L',
        color: 'red',
        fit: 'slim',
        gender: 'male',
      });
    });

    it('returns totalAmount 0 and an empty items array when the cart has no products', async () => {
      const { service } = await setupFindUnique(makeOrderWithCart({}, {}, []));

      const result = await service.findOne(orderId, managerUser);

      expect(result.totalAmount).toBe(0);
      expect(result.items).toEqual([]);
    });

    it('passes the requested orderId to prisma.order.findUnique', async () => {
      const { service, prisma: findOnePrisma } =
        await setupFindUnique(makeOrderWithCart());

      await service.findOne(orderId, managerUser);

      const argsString = JSON.stringify(
        findOnePrisma.order.findUnique.mock.calls,
      );
      expect(argsString).toContain(orderId);
    });

    describe('delivery person assignment', () => {
      const deliveryPersonId = 'delivery-1';

      it('returns null deliveryPersonId and no fabricated name/email when unassigned', async () => {
        const { service } = await setupFindUnique(
          makeOrderWithCart({ deliveryPersonId: null, deliveryPerson: null }),
        );

        const result = await service.findOne(orderId, managerUser);

        expect(result.deliveryPersonId).toBeNull();
        expect(JSON.stringify(result)).not.toContain('Dana Delivery');
        expect(JSON.stringify(result)).not.toContain('dana@example.com');
      });

      it('does not throw when unassigned', async () => {
        const { service } = await setupFindUnique(
          makeOrderWithCart({ deliveryPersonId: null, deliveryPerson: null }),
        );

        await expect(
          service.findOne(orderId, managerUser),
        ).resolves.not.toThrow();
      });

      it('surfaces the assigned deliveryPersonId and the delivery person name/email when assigned', async () => {
        const { service } = await setupFindUnique(
          makeOrderWithCart({
            deliveryPersonId,
            deliveryPerson: {
              id: deliveryPersonId,
              fullName: 'Dana Delivery',
              email: 'dana@example.com',
            },
          }),
        );

        const result = await service.findOne(orderId, managerUser);

        expect(result.deliveryPersonId).toBe(deliveryPersonId);
        const resultString = JSON.stringify(result);
        expect(resultString).toContain('Dana Delivery');
        expect(resultString).toContain('dana@example.com');
      });
    });
  });

  describe('advanceStatus', () => {
    const orderId = 'order-1';
    const deliveryPersonId = 'delivery-1';
    const otherDeliveryPersonId = 'delivery-2';

    const deliveryUser: JwtPayload = {
      sub: deliveryPersonId,
      role: Role.deliveryPerson,
    };

    const makeCartProduct = (overrides: Record<string, unknown> = {}) => ({
      skuId: 'sku-1',
      quantity: 2,
      unitPrice: 25.5,
      ...overrides,
    });

    const makeOrder = (
      overrides: Record<string, unknown> = {},
      cartOverrides: Record<string, unknown> = {},
      cartProducts: Record<string, unknown>[] = [makeCartProduct()],
    ) => ({
      id: orderId,
      cartNumber: 'cart-1',
      status: OrderStatus.paid,
      paymentLink: 'https://buy.stripe.com/test',
      paymentIntent: null,
      deliveryPersonId: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
      cart: {
        userId: clientUserId,
        cartProducts,
        ...cartOverrides,
      },
    });

    const setupAdvance = async (
      findUniqueReturn: Record<string, unknown> | null,
      updateReturn: Record<string, unknown> | null = findUniqueReturn,
    ) => {
      const advancePrisma = {
        order: {
          findUnique: vi.fn().mockResolvedValue(findUniqueReturn),
          update: vi.fn().mockResolvedValue(updateReturn),
        },
      };

      const moduleRef = await Test.createTestingModule({
        providers: [OrdersService, PrismaService],
      })
        .overrideProvider(PrismaService)
        .useValue(advancePrisma)
        .compile();

      return {
        service: moduleRef.get(OrdersService),
        prisma: advancePrisma,
      };
    };

    it('throws NotFoundException when no order exists with the given id, and does not call update', async () => {
      const { service, prisma: advancePrisma } = await setupAdvance(null);

      await expect(
        service.advanceStatus(orderId, OrderStatus.processing, managerUser),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(advancePrisma.order.update).not.toHaveBeenCalled();
    });

    it('allows a manager to drive paid -> processing and persists the new status', async () => {
      const updatedOrder = makeOrder({
        status: OrderStatus.processing,
        updatedAt: new Date('2024-06-02T00:00:00.000Z'),
      });
      const { service, prisma: advancePrisma } = await setupAdvance(
        makeOrder({ status: OrderStatus.paid }),
        updatedOrder,
      );

      const result = await service.advanceStatus(
        orderId,
        OrderStatus.processing,
        managerUser,
      );

      expect(advancePrisma.order.update).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({
          orderId,
          cartNumber: 'cart-1',
          userId: clientUserId,
          status: OrderStatus.processing,
          totalAmount: 51,
          deliveryPersonId: null,
          createdAt: now,
        }),
      );
    });

    it('allows a manager to drive processing -> shipped when a delivery person is assigned', async () => {
      const updatedOrder = makeOrder({
        status: OrderStatus.shipped,
        deliveryPersonId,
        updatedAt: new Date('2024-06-03T00:00:00.000Z'),
      });
      const { service, prisma: advancePrisma } = await setupAdvance(
        makeOrder({ status: OrderStatus.processing, deliveryPersonId }),
        updatedOrder,
      );

      const result = await service.advanceStatus(
        orderId,
        OrderStatus.shipped,
        managerUser,
      );

      expect(advancePrisma.order.update).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({
          orderId,
          userId: clientUserId,
          status: OrderStatus.shipped,
          deliveryPersonId,
        }),
      );
    });

    it('throws UnprocessableEntityException for processing -> shipped when no delivery person is assigned, and does not call update', async () => {
      const { service, prisma: advancePrisma } = await setupAdvance(
        makeOrder({ status: OrderStatus.processing, deliveryPersonId: null }),
      );

      await expect(
        service.advanceStatus(orderId, OrderStatus.shipped, managerUser),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(advancePrisma.order.update).not.toHaveBeenCalled();
    });

    it.each([
      [OrderStatus.pending, OrderStatus.processing],
      [OrderStatus.paid, OrderStatus.shipped],
      [OrderStatus.shipped, OrderStatus.shipped],
      [OrderStatus.cancelled, OrderStatus.processing],
      [OrderStatus.processing, OrderStatus.processing],
      [OrderStatus.pending, OrderStatus.shipped],
    ])(
      'throws UnprocessableEntityException for %s -> %s and does not call update',
      async (currentStatus, requestedStatus) => {
        const { service, prisma: advancePrisma } = await setupAdvance(
          makeOrder({ status: currentStatus, deliveryPersonId }),
        );

        await expect(
          service.advanceStatus(orderId, requestedStatus, managerUser),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(advancePrisma.order.update).not.toHaveBeenCalled();
      },
    );

    it('throws ForbiddenException when a manager attempts shipped -> delivered', async () => {
      const { service, prisma: advancePrisma } = await setupAdvance(
        makeOrder({ status: OrderStatus.shipped, deliveryPersonId }),
      );

      await expect(
        service.advanceStatus(orderId, OrderStatus.delivered, managerUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(advancePrisma.order.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when a client attempts shipped -> delivered', async () => {
      const { service, prisma: advancePrisma } = await setupAdvance(
        makeOrder({ status: OrderStatus.shipped, deliveryPersonId }),
      );

      await expect(
        service.advanceStatus(orderId, OrderStatus.delivered, clientUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(advancePrisma.order.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the requesting delivery person is not assigned to the order (unassigned)', async () => {
      const { service, prisma: advancePrisma } = await setupAdvance(
        makeOrder({ status: OrderStatus.shipped, deliveryPersonId: null }),
      );

      await expect(
        service.advanceStatus(orderId, OrderStatus.delivered, deliveryUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(advancePrisma.order.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the requesting delivery person is assigned to a different order', async () => {
      const { service, prisma: advancePrisma } = await setupAdvance(
        makeOrder({
          status: OrderStatus.shipped,
          deliveryPersonId: otherDeliveryPersonId,
        }),
      );

      await expect(
        service.advanceStatus(orderId, OrderStatus.delivered, deliveryUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(advancePrisma.order.update).not.toHaveBeenCalled();
    });

    it.each([[OrderStatus.processing], [OrderStatus.shipped]])(
      'throws ForbiddenException when the assigned delivery person requests %s instead of delivered',
      async (requestedStatus) => {
        const { service, prisma: advancePrisma } = await setupAdvance(
          makeOrder({ status: OrderStatus.paid, deliveryPersonId }),
        );

        await expect(
          service.advanceStatus(orderId, requestedStatus, deliveryUser),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(advancePrisma.order.update).not.toHaveBeenCalled();
      },
    );

    it('allows the assigned delivery person to mark their own shipped order as delivered', async () => {
      const updatedOrder = makeOrder({
        status: OrderStatus.delivered,
        deliveryPersonId,
        updatedAt: new Date('2024-06-04T00:00:00.000Z'),
      });
      const { service, prisma: advancePrisma } = await setupAdvance(
        makeOrder({ status: OrderStatus.shipped, deliveryPersonId }),
        updatedOrder,
      );

      const result = await service.advanceStatus(
        orderId,
        OrderStatus.delivered,
        deliveryUser,
      );

      expect(advancePrisma.order.update).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({
          orderId,
          cartNumber: 'cart-1',
          userId: clientUserId,
          status: OrderStatus.delivered,
          deliveryPersonId,
          totalAmount: 51,
          createdAt: now,
        }),
      );
    });

    it('computes totalAmount from unitPrice * quantity across all cart items', async () => {
      const cartProducts = [
        makeCartProduct({ skuId: 'sku-1', quantity: 2, unitPrice: 25.5 }),
        makeCartProduct({ skuId: 'sku-2', quantity: 3, unitPrice: 10 }),
      ];
      const updatedOrder = makeOrder(
        { status: OrderStatus.processing },
        {},
        cartProducts,
      );
      const { service } = await setupAdvance(
        makeOrder({ status: OrderStatus.paid }, {}, cartProducts),
        updatedOrder,
      );

      const result = await service.advanceStatus(
        orderId,
        OrderStatus.processing,
        managerUser,
      );

      expect(result.totalAmount).toBe(25.5 * 2 + 10 * 3);
    });

    it('derives payment_link when paymentLink is set', async () => {
      const updatedOrder = makeOrder({
        status: OrderStatus.processing,
        paymentLink: 'https://buy.stripe.com/x',
        paymentIntent: null,
      });
      const { service } = await setupAdvance(
        makeOrder({
          status: OrderStatus.paid,
          paymentLink: 'https://buy.stripe.com/x',
          paymentIntent: null,
        }),
        updatedOrder,
      );

      const result = await service.advanceStatus(
        orderId,
        OrderStatus.processing,
        managerUser,
      );

      expect(result.paymentMethod).toBe('payment_link');
    });

    it('derives payment_intent when paymentLink is null', async () => {
      const updatedOrder = makeOrder({
        status: OrderStatus.processing,
        paymentLink: null,
        paymentIntent: 'pi_123',
      });
      const { service } = await setupAdvance(
        makeOrder({
          status: OrderStatus.paid,
          paymentLink: null,
          paymentIntent: 'pi_123',
        }),
        updatedOrder,
      );

      const result = await service.advanceStatus(
        orderId,
        OrderStatus.processing,
        managerUser,
      );

      expect(result.paymentMethod).toBe('payment_intent');
    });

    it('passes the requested orderId to prisma.order.findUnique', async () => {
      const { service, prisma: advancePrisma } = await setupAdvance(
        makeOrder({ status: OrderStatus.paid }),
      );

      await service.advanceStatus(orderId, OrderStatus.processing, managerUser);

      const argsString = JSON.stringify(
        advancePrisma.order.findUnique.mock.calls,
      );
      expect(argsString).toContain(orderId);
    });
  });

  describe('cancel', () => {
    const orderId = 'order-1';

    const makeCartProduct = (overrides: Record<string, unknown> = {}) => ({
      skuId: 'sku-1',
      quantity: 2,
      unitPrice: 25.5,
      ...overrides,
    });

    const makeOrder = (
      overrides: Record<string, unknown> = {},
      cartOverrides: Record<string, unknown> = {},
      cartProducts: Record<string, unknown>[] = [makeCartProduct()],
    ) => ({
      id: orderId,
      cartNumber: 'cart-1',
      status: OrderStatus.pending,
      paymentLink: 'https://buy.stripe.com/test',
      paymentIntent: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
      cart: {
        userId: clientUserId,
        cartProducts,
        ...cartOverrides,
      },
    });

    const setupCancel = async (
      findUniqueReturn: Record<string, unknown> | null,
      updateReturn: Record<string, unknown> | null = findUniqueReturn,
    ) => {
      const cancelPrisma = {
        order: {
          findUnique: vi.fn().mockResolvedValue(findUniqueReturn),
          update: vi.fn().mockResolvedValue(updateReturn),
        },
      };

      const moduleRef = await Test.createTestingModule({
        providers: [OrdersService, PrismaService],
      })
        .overrideProvider(PrismaService)
        .useValue(cancelPrisma)
        .compile();

      return {
        service: moduleRef.get(OrdersService),
        prisma: cancelPrisma,
      };
    };

    it('throws NotFoundException when no order exists with the given id, and does not call update', async () => {
      const { service, prisma: cancelPrisma } = await setupCancel(null);

      await expect(service.cancel(orderId, clientUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(cancelPrisma.order.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when a client cancels an order they do not own, and does not call update', async () => {
      const { service, prisma: cancelPrisma } = await setupCancel(
        makeOrder({}, { userId: otherUserId }),
      );

      await expect(service.cancel(orderId, clientUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(cancelPrisma.order.update).not.toHaveBeenCalled();
    });

    it.each([[OrderStatus.shipped], [OrderStatus.cancelled]])(
      'throws UnprocessableEntityException when status is %s, and does not call update',
      async (currentStatus) => {
        const { service, prisma: cancelPrisma } = await setupCancel(
          makeOrder({ status: currentStatus }),
        );

        await expect(
          service.cancel(orderId, clientUser),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(cancelPrisma.order.update).not.toHaveBeenCalled();
      },
    );

    it('throws UnprocessableEntityException with an "already delivered" message when status is delivered, and does not call update', async () => {
      const { service, prisma: cancelPrisma } = await setupCancel(
        makeOrder({ status: OrderStatus.delivered }),
      );

      const promise = service.cancel(orderId, clientUser);

      await expect(promise).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      await expect(promise).rejects.toThrow('already delivered');
      await expect(promise).rejects.not.toThrow('already shipped');
      expect(cancelPrisma.order.update).not.toHaveBeenCalled();
    });

    it.each([
      [OrderStatus.pending],
      [OrderStatus.paid],
      [OrderStatus.processing],
    ])(
      'cancels an order in %s status and returns it with status cancelled',
      async (currentStatus) => {
        const updatedOrder = makeOrder({
          status: OrderStatus.cancelled,
          updatedAt: new Date('2024-06-04T00:00:00.000Z'),
        });
        const { service, prisma: cancelPrisma } = await setupCancel(
          makeOrder({ status: currentStatus }),
          updatedOrder,
        );

        const result = await service.cancel(orderId, clientUser);

        expect(cancelPrisma.order.update).toHaveBeenCalledTimes(1);
        expect(result).toEqual(
          expect.objectContaining({
            orderId,
            cartNumber: 'cart-1',
            userId: clientUserId,
            status: OrderStatus.cancelled,
            createdAt: now,
          }),
        );
      },
    );

    it('computes totalAmount from unitPrice * quantity across all cart items', async () => {
      const cartProducts = [
        makeCartProduct({ skuId: 'sku-1', quantity: 2, unitPrice: 25.5 }),
        makeCartProduct({ skuId: 'sku-2', quantity: 3, unitPrice: 10 }),
      ];
      const updatedOrder = makeOrder(
        { status: OrderStatus.cancelled },
        {},
        cartProducts,
      );
      const { service } = await setupCancel(
        makeOrder({ status: OrderStatus.pending }, {}, cartProducts),
        updatedOrder,
      );

      const result = await service.cancel(orderId, clientUser);

      expect(result.totalAmount).toBe(25.5 * 2 + 10 * 3);
    });

    it('derives payment_link when paymentLink is set', async () => {
      const updatedOrder = makeOrder({
        status: OrderStatus.cancelled,
        paymentLink: 'https://buy.stripe.com/x',
        paymentIntent: null,
      });
      const { service } = await setupCancel(
        makeOrder({
          status: OrderStatus.pending,
          paymentLink: 'https://buy.stripe.com/x',
          paymentIntent: null,
        }),
        updatedOrder,
      );

      const result = await service.cancel(orderId, clientUser);

      expect(result.paymentMethod).toBe('payment_link');
    });

    it('derives payment_intent when paymentLink is null', async () => {
      const updatedOrder = makeOrder({
        status: OrderStatus.cancelled,
        paymentLink: null,
        paymentIntent: 'pi_123',
      });
      const { service } = await setupCancel(
        makeOrder({
          status: OrderStatus.pending,
          paymentLink: null,
          paymentIntent: 'pi_123',
        }),
        updatedOrder,
      );

      const result = await service.cancel(orderId, clientUser);

      expect(result.paymentMethod).toBe('payment_intent');
    });

    it('passes the requested orderId to prisma.order.findUnique', async () => {
      const { service, prisma: cancelPrisma } = await setupCancel(
        makeOrder({ status: OrderStatus.pending }),
      );

      await service.cancel(orderId, clientUser);

      const argsString = JSON.stringify(
        cancelPrisma.order.findUnique.mock.calls,
      );
      expect(argsString).toContain(orderId);
    });
  });

  describe('assignDeliveryPerson', () => {
    const orderId = 'order-1';
    const deliveryPersonId = 'delivery-1';

    const makeCartProduct = (overrides: Record<string, unknown> = {}) => ({
      skuId: 'sku-1',
      quantity: 2,
      unitPrice: 25.5,
      ...overrides,
    });

    const makeOrder = (
      overrides: Record<string, unknown> = {},
      cartOverrides: Record<string, unknown> = {},
      cartProducts: Record<string, unknown>[] = [makeCartProduct()],
    ) => ({
      id: orderId,
      cartNumber: 'cart-1',
      status: OrderStatus.paid,
      paymentLink: 'https://buy.stripe.com/test',
      paymentIntent: null,
      deliveryPersonId: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
      cart: {
        userId: clientUserId,
        cartProducts,
        ...cartOverrides,
      },
    });

    const makeDeliveryUser = (overrides: Record<string, unknown> = {}) => ({
      id: deliveryPersonId,
      email: 'delivery@example.com',
      password: 'hashed',
      fullName: 'Delivery Person',
      role: Role.deliveryPerson,
      isActive: true,
      isVerified: true,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    });

    const setupAssign = async (
      orderFindUniqueReturn: Record<string, unknown> | null,
      userFindUniqueReturn: Record<string, unknown> | null,
      updateReturn: Record<string, unknown> | null = orderFindUniqueReturn,
    ) => {
      const assignPrisma = {
        order: {
          findUnique: vi.fn().mockResolvedValue(orderFindUniqueReturn),
          update: vi.fn().mockResolvedValue(updateReturn),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue(userFindUniqueReturn),
        },
      };

      const moduleRef = await Test.createTestingModule({
        providers: [OrdersService, PrismaService],
      })
        .overrideProvider(PrismaService)
        .useValue(assignPrisma)
        .compile();

      return {
        service: moduleRef.get(OrdersService),
        prisma: assignPrisma,
      };
    };

    it('throws NotFoundException when no order exists with the given id, and does not call update', async () => {
      const { service, prisma: assignPrisma } = await setupAssign(
        null,
        makeDeliveryUser(),
      );

      await expect(
        service.assignDeliveryPerson(orderId, deliveryPersonId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(assignPrisma.order.update).not.toHaveBeenCalled();
    });

    it.each([
      [OrderStatus.pending],
      [OrderStatus.shipped],
      [OrderStatus.cancelled],
    ])(
      'throws UnprocessableEntityException when order status is %s, and does not call update',
      async (currentStatus) => {
        const { service, prisma: assignPrisma } = await setupAssign(
          makeOrder({ status: currentStatus }),
          makeDeliveryUser(),
        );

        await expect(
          service.assignDeliveryPerson(orderId, deliveryPersonId),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(assignPrisma.order.update).not.toHaveBeenCalled();
      },
    );

    it('throws NotFoundException when no user exists with the given deliveryPersonId, and does not call update', async () => {
      const { service, prisma: assignPrisma } = await setupAssign(
        makeOrder({ status: OrderStatus.paid }),
        null,
      );

      await expect(
        service.assignDeliveryPerson(orderId, deliveryPersonId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(assignPrisma.order.update).not.toHaveBeenCalled();
    });

    it('rejects assignment when the target user role is client, and does not call update', async () => {
      const { service, prisma: assignPrisma } = await setupAssign(
        makeOrder({ status: OrderStatus.paid }),
        makeDeliveryUser({ role: Role.client }),
      );

      await expect(
        service.assignDeliveryPerson(orderId, deliveryPersonId),
      ).rejects.toThrow();
      expect(assignPrisma.order.update).not.toHaveBeenCalled();
    });

    it('rejects assignment when the target user role is manager, and does not call update', async () => {
      const { service, prisma: assignPrisma } = await setupAssign(
        makeOrder({ status: OrderStatus.paid }),
        makeDeliveryUser({ role: Role.manager }),
      );

      await expect(
        service.assignDeliveryPerson(orderId, deliveryPersonId),
      ).rejects.toThrow();
      expect(assignPrisma.order.update).not.toHaveBeenCalled();
    });

    it('rejects assignment when the target delivery person is inactive, and does not call update', async () => {
      const { service, prisma: assignPrisma } = await setupAssign(
        makeOrder({ status: OrderStatus.paid }),
        makeDeliveryUser({ isActive: false }),
      );

      await expect(
        service.assignDeliveryPerson(orderId, deliveryPersonId),
      ).rejects.toThrow();
      expect(assignPrisma.order.update).not.toHaveBeenCalled();
    });

    it.each([[OrderStatus.paid], [OrderStatus.processing]])(
      'assigns the delivery person when order status is %s and updates deliveryPersonId',
      async (currentStatus) => {
        const updatedOrder = makeOrder({
          status: currentStatus,
          deliveryPersonId,
          updatedAt: new Date('2024-06-05T00:00:00.000Z'),
        });
        const { service, prisma: assignPrisma } = await setupAssign(
          makeOrder({ status: currentStatus }),
          makeDeliveryUser(),
          updatedOrder,
        );

        const result = await service.assignDeliveryPerson(
          orderId,
          deliveryPersonId,
        );

        expect(assignPrisma.order.update).toHaveBeenCalledTimes(1);
        expect(result).toEqual(
          expect.objectContaining({
            orderId,
            cartNumber: 'cart-1',
            userId: clientUserId,
            status: currentStatus,
          }),
        );
      },
    );

    it('computes totalAmount from unitPrice * quantity across all cart items', async () => {
      const cartProducts = [
        makeCartProduct({ skuId: 'sku-1', quantity: 2, unitPrice: 25.5 }),
        makeCartProduct({ skuId: 'sku-2', quantity: 3, unitPrice: 10 }),
      ];
      const updatedOrder = makeOrder(
        { status: OrderStatus.paid, deliveryPersonId },
        {},
        cartProducts,
      );
      const { service } = await setupAssign(
        makeOrder({ status: OrderStatus.paid }, {}, cartProducts),
        makeDeliveryUser(),
        updatedOrder,
      );

      const result = await service.assignDeliveryPerson(
        orderId,
        deliveryPersonId,
      );

      expect(result.totalAmount).toBe(25.5 * 2 + 10 * 3);
    });

    it('derives payment_link when paymentLink is set', async () => {
      const updatedOrder = makeOrder({
        status: OrderStatus.paid,
        deliveryPersonId,
        paymentLink: 'https://buy.stripe.com/x',
        paymentIntent: null,
      });
      const { service } = await setupAssign(
        makeOrder({
          status: OrderStatus.paid,
          paymentLink: 'https://buy.stripe.com/x',
          paymentIntent: null,
        }),
        makeDeliveryUser(),
        updatedOrder,
      );

      const result = await service.assignDeliveryPerson(
        orderId,
        deliveryPersonId,
      );

      expect(result.paymentMethod).toBe('payment_link');
    });

    it('derives payment_intent when paymentLink is null', async () => {
      const updatedOrder = makeOrder({
        status: OrderStatus.paid,
        deliveryPersonId,
        paymentLink: null,
        paymentIntent: 'pi_123',
      });
      const { service } = await setupAssign(
        makeOrder({
          status: OrderStatus.paid,
          paymentLink: null,
          paymentIntent: 'pi_123',
        }),
        makeDeliveryUser(),
        updatedOrder,
      );

      const result = await service.assignDeliveryPerson(
        orderId,
        deliveryPersonId,
      );

      expect(result.paymentMethod).toBe('payment_intent');
    });

    it('succeeds when re-assigning the same deliveryPersonId already on the order', async () => {
      const alreadyAssignedOrder = makeOrder({
        status: OrderStatus.processing,
        deliveryPersonId,
      });
      const { service } = await setupAssign(
        alreadyAssignedOrder,
        makeDeliveryUser(),
        alreadyAssignedOrder,
      );

      const result = await service.assignDeliveryPerson(
        orderId,
        deliveryPersonId,
      );

      expect(result).toEqual(
        expect.objectContaining({
          orderId,
          status: OrderStatus.processing,
        }),
      );
    });

    it('passes the requested orderId to prisma.order.findUnique', async () => {
      const { service, prisma: assignPrisma } = await setupAssign(
        makeOrder({ status: OrderStatus.paid }),
        makeDeliveryUser(),
      );

      await service.assignDeliveryPerson(orderId, deliveryPersonId);

      const argsString = JSON.stringify(
        assignPrisma.order.findUnique.mock.calls,
      );
      expect(argsString).toContain(orderId);
    });

    it('passes the requested deliveryPersonId to prisma.user.findUnique', async () => {
      const { service, prisma: assignPrisma } = await setupAssign(
        makeOrder({ status: OrderStatus.paid }),
        makeDeliveryUser(),
      );

      await service.assignDeliveryPerson(orderId, deliveryPersonId);

      const argsString = JSON.stringify(
        assignPrisma.user.findUnique.mock.calls,
      );
      expect(argsString).toContain(deliveryPersonId);
    });
  });
});
