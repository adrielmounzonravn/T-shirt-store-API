import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { CreateDeliveryPersonDto } from './dto/create-delivery-person.dto.js';
import { UserEntity } from './entities/user.entity.js';
import { Role } from '../generated/prisma/enums.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { PoliciesGuard } from '../casl/guards/policies.guard.js';

describe('UsersController', () => {
  let usersController: UsersController;
  let createMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    createMock = vi.fn();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: { create: createMock },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PoliciesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    usersController = app.get<UsersController>(UsersController);
  });

  describe('create', () => {
    it('calls usersService.create exactly once with the received dto', async () => {
      const dto: CreateDeliveryPersonDto = {
        email: 'delivery.person@example.com',
        password: 'password123',
        fullName: 'Jane Delivery',
        role: Role.deliveryPerson,
      };
      createMock.mockResolvedValue(
        new UserEntity({
          id: 'user-id',
          email: dto.email,
          password: 'hashed',
          fullName: dto.fullName,
          role: Role.deliveryPerson,
          isActive: true,
          isVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      await usersController.create(dto);

      expect(createMock).toHaveBeenCalledTimes(1);
      expect(createMock).toHaveBeenCalledWith({ ...dto, isVerified: true });
    });

    it('always forces isVerified: true, regardless of what the dto contains', async () => {
      const dto = {
        email: 'delivery.person@example.com',
        password: 'password123',
        fullName: 'Jane Delivery',
        role: Role.deliveryPerson,
        isVerified: false,
      } as CreateDeliveryPersonDto;
      createMock.mockResolvedValue(
        new UserEntity({
          id: 'user-id',
          email: dto.email,
          password: 'hashed',
          fullName: dto.fullName,
          role: Role.deliveryPerson,
          isActive: true,
          isVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      await usersController.create(dto);

      const [callArg] = createMock.mock.calls[0] as [{ isVerified: boolean }];
      expect(callArg.isVerified).toBe(true);
    });

    it('resolves with whatever usersService.create resolved with', async () => {
      const dto: CreateDeliveryPersonDto = {
        email: 'delivery.person@example.com',
        password: 'password123',
        fullName: 'Jane Delivery',
        role: Role.deliveryPerson,
      };
      const entity = new UserEntity({
        id: 'user-id',
        email: dto.email,
        password: 'hashed',
        fullName: dto.fullName,
        role: Role.deliveryPerson,
        isActive: true,
        isVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      createMock.mockResolvedValue(entity);

      await expect(usersController.create(dto)).resolves.toBe(entity);
    });

    it('rejects with the same error when usersService.create rejects', async () => {
      const dto: CreateDeliveryPersonDto = {
        email: 'duplicate@example.com',
        password: 'password123',
        fullName: 'Jane Delivery',
        role: Role.deliveryPerson,
      };
      const conflictError = new Error('Email already in use');
      createMock.mockRejectedValue(conflictError);

      await expect(usersController.create(dto)).rejects.toBe(conflictError);
    });
  });
});
