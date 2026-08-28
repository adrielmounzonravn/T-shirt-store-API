import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { LocalStrategy } from './local.strategy.js';
import { AuthService } from '../auth.service.js';
import { UserEntity } from '../../users/entities/user.entity.js';
import { Role } from '../../generated/prisma/enums.js';

describe('LocalStrategy', () => {
  let strategy: LocalStrategy;
  let authService: { validateUser: ReturnType<typeof vi.fn> };

  const userRow = new UserEntity({
    id: 'user-1',
    email: 'jane@example.com',
    password: 'hashed-password-value',
    fullName: 'Jane Doe',
    role: Role.client,
    isActive: true,
    isVerified: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  });

  beforeEach(async () => {
    authService = {
      validateUser: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [LocalStrategy, AuthService],
    })
      .overrideProvider(AuthService)
      .useValue(authService)
      .compile();

    strategy = moduleRef.get(LocalStrategy);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validate', () => {
    it('resolves to the UserEntity when credentials are valid', async () => {
      authService.validateUser.mockResolvedValue(userRow);

      const result = await strategy.validate(
        'jane@example.com',
        'plaintext-password',
      );

      expect(authService.validateUser).toHaveBeenCalledWith(
        'jane@example.com',
        'plaintext-password',
      );
      expect(result).toEqual(userRow);
    });

    it('rejects with UnauthorizedException when credentials are invalid', async () => {
      authService.validateUser.mockResolvedValue(null);

      await expect(
        strategy.validate('jane@example.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
