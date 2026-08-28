import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { Role } from '../generated/prisma/enums.js';

vi.mock('bcrypt', () => {
  const compare = vi.fn();
  const hash = vi.fn();
  return {
    default: { compare, hash },
    compare,
    hash,
  };
});

import * as bcrypt from 'bcrypt';

const compareMock = bcrypt.compare as ReturnType<typeof vi.fn>;

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    create: ReturnType<typeof vi.fn>;
    findByEmail: ReturnType<typeof vi.fn>;
  };
  let jwtService: { sign: ReturnType<typeof vi.fn> };

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
    usersService = {
      create: vi.fn(),
      findByEmail: vi.fn(),
    };
    jwtService = {
      sign: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [AuthService, UsersService, JwtService],
    })
      .overrideProvider(UsersService)
      .useValue(usersService)
      .overrideProvider(JwtService)
      .useValue(jwtService)
      .compile();

    service = moduleRef.get(AuthService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('signUp', () => {
    const input = {
      email: 'jane@example.com',
      password: 'plaintext-password',
      fullName: 'Jane Doe',
    };

    it('delegates to usersService.create with the exact input', async () => {
      usersService.create.mockResolvedValue(userRow);

      await service.signUp(input);

      expect(usersService.create).toHaveBeenCalledWith(input);
      expect(usersService.create).toHaveBeenCalledTimes(1);
    });

    it('resolves to whatever usersService.create resolves to', async () => {
      usersService.create.mockResolvedValue(userRow);

      const result = await service.signUp(input);

      expect(result).toBe(userRow);
    });

    it('propagates the error when usersService.create rejects', async () => {
      const error = new Error(
        'Unique constraint failed on the fields: (`email`)',
      );
      usersService.create.mockRejectedValue(error);

      await expect(service.signUp(input)).rejects.toThrow(error);
    });
  });

  describe('validateUser', () => {
    it('resolves to null and never calls bcrypt.compare when no user is found', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.validateUser(
        'missing@example.com',
        'any-password',
      );

      expect(result).toBeNull();
      expect(compareMock).not.toHaveBeenCalled();
    });

    it('resolves to the UserEntity when the password matches', async () => {
      usersService.findByEmail.mockResolvedValue(userRow);
      compareMock.mockResolvedValue(true);

      const result = await service.validateUser(
        'jane@example.com',
        'plaintext-password',
      );

      expect(usersService.findByEmail).toHaveBeenCalledWith('jane@example.com');
      expect(compareMock).toHaveBeenCalledWith(
        'plaintext-password',
        userRow.password,
      );
      expect(result).toEqual(userRow);
    });

    it('resolves to null when the password does not match', async () => {
      usersService.findByEmail.mockResolvedValue(userRow);
      compareMock.mockResolvedValue(false);

      const result = await service.validateUser(
        'jane@example.com',
        'wrong-password',
      );

      expect(compareMock).toHaveBeenCalledWith(
        'wrong-password',
        userRow.password,
      );
      expect(result).toBeNull();
    });
  });

  describe('signIn', () => {
    it('resolves to an accessToken produced by jwtService.sign for a verified user', () => {
      jwtService.sign.mockReturnValue('signed-jwt-token');

      const result = service.signIn(userRow);

      expect(result).toEqual({ accessToken: 'signed-jwt-token' });
    });

    it('signs a payload containing exactly sub and role, nothing else', () => {
      jwtService.sign.mockReturnValue('signed-jwt-token');

      service.signIn(userRow);

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: userRow.id,
        role: userRow.role,
      });
      expect(jwtService.sign).toHaveBeenCalledTimes(1);
    });

    it('throws ForbiddenException and never signs a token for an unverified user', () => {
      const unverifiedUser = new UserEntity({
        ...userRow,
        isVerified: false,
      });

      expect(() => service.signIn(unverifiedUser)).toThrow(ForbiddenException);
      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });
});
