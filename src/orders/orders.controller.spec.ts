import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { AssignDeliveryPersonDto } from './dto/assign-delivery-person.dto.js';
import {
  OrderEntity,
  PaymentMethod,
} from '../checkout/entities/order.entity.js';
import { OrderStatus } from '../generated/prisma/enums.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PoliciesGuard } from '../casl/guards/policies.guard.js';

describe('OrdersController', () => {
  let ordersController: OrdersController;
  let assignDeliveryPersonMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    assignDeliveryPersonMock = vi.fn();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: { assignDeliveryPerson: assignDeliveryPersonMock },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PoliciesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    ordersController = app.get<OrdersController>(OrdersController);
  });

  describe('assignDeliveryPerson', () => {
    const orderId = '11111111-1111-4111-8111-111111111111';
    const dto: AssignDeliveryPersonDto = {
      deliveryPersonId: '22222222-2222-4222-8222-222222222222',
    };

    it('calls ordersService.assignDeliveryPerson exactly once with the orderId and deliveryPersonId', async () => {
      assignDeliveryPersonMock.mockResolvedValue(
        new OrderEntity({
          id: orderId,
          cartNumber: 'cart-1',
          userId: 'user-id',
          status: OrderStatus.processing,
          paymentMethod: PaymentMethod.payment_link,
          totalAmount: 1000,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      await ordersController.assignDeliveryPerson(orderId, dto);

      expect(assignDeliveryPersonMock).toHaveBeenCalledTimes(1);
      expect(assignDeliveryPersonMock).toHaveBeenCalledWith(
        orderId,
        dto.deliveryPersonId,
      );
    });

    it('resolves with whatever ordersService.assignDeliveryPerson resolved with', async () => {
      const entity = new OrderEntity({
        id: orderId,
        cartNumber: 'cart-1',
        userId: 'user-id',
        status: OrderStatus.processing,
        paymentMethod: PaymentMethod.payment_link,
        totalAmount: 1000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      assignDeliveryPersonMock.mockResolvedValue(entity);

      await expect(
        ordersController.assignDeliveryPerson(orderId, dto),
      ).resolves.toBe(entity);
    });

    it('rejects with the same error when ordersService.assignDeliveryPerson rejects', async () => {
      const notFoundError = new Error('Order not found');
      assignDeliveryPersonMock.mockRejectedValue(notFoundError);

      await expect(
        ordersController.assignDeliveryPerson(orderId, dto),
      ).rejects.toBe(notFoundError);
    });
  });
});
