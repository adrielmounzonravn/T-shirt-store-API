import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
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
});
