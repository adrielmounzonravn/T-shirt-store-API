import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';
import { UserEntity } from './entities/user.entity.js';
import { Role } from '../generated/prisma/enums.js';

vi.mock('bcrypt', () => {
  const hash = vi.fn();
  return {
    default: { hash },
    hash,
  };
});

import * as bcrypt from 'bcrypt';

const hashMock = bcrypt.hash as ReturnType<typeof vi.fn>;

interface CreateArgs {
  data: Record<string, unknown>;
}

function lastCreateData(
  createMock: ReturnType<typeof vi.fn>,
): Record<string, unknown> {
  const [args] = createMock.mock.calls[0] as [CreateArgs];
  return args.data;
}

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    userAuth: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let configService: { getOrThrow: ReturnType<typeof vi.fn> };

  const SALT_ROUNDS = 10;
  const HASHED_PASSWORD = 'hashed-password-value';

  const userRow = {
    id: 'user-1',
    email: 'jane@example.com',
    password: HASHED_PASSWORD,
    fullName: 'Jane Doe',
    role: Role.client,
    isActive: true,
    isVerified: false,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = {
      user: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      userAuth: {
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    configService = {
      getOrThrow: vi.fn().mockReturnValue(SALT_ROUNDS),
    };
    hashMock.mockResolvedValue(HASHED_PASSWORD);

    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, PrismaService, ConfigService],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(ConfigService)
      .useValue(configService)
      .compile();

    service = moduleRef.get(UsersService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    const input = {
      email: 'jane@example.com',
      password: 'plaintext-password',
      fullName: 'Jane Doe',
    };

    it('hashes the password using the configured bcrypt salt rounds', async () => {
      prisma.user.create.mockResolvedValue(userRow);

      await service.create(input);

      expect(configService.getOrThrow).toHaveBeenCalledWith(
        'auth.bcryptSaltRounds',
      );
      expect(hashMock).toHaveBeenCalledWith(input.password, SALT_ROUNDS);
    });

    it('persists the hashed password, never the plaintext password', async () => {
      prisma.user.create.mockResolvedValue(userRow);

      await service.create(input);

      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      const data = lastCreateData(prisma.user.create);
      expect(data.password).toBe(HASHED_PASSWORD);
      expect(data.password).not.toBe(input.password);
    });

    it('persists only email, hashed password, fullName, role, and isVerified', async () => {
      prisma.user.create.mockResolvedValue(userRow);

      await service.create(input);

      const data = lastCreateData(prisma.user.create);
      expect(data).toEqual({
        email: input.email,
        password: HASHED_PASSWORD,
        fullName: input.fullName,
        role: Role.client,
        isVerified: false,
      });
    });

    it('defaults isVerified to false when not provided', async () => {
      prisma.user.create.mockResolvedValue(userRow);

      await service.create(input);

      const data = lastCreateData(prisma.user.create);
      expect(data.isVerified).toBe(false);
    });

    it('forwards a caller-supplied isVerified: true to Prisma', async () => {
      const verifiedRow = { ...userRow, isVerified: true };
      prisma.user.create.mockResolvedValue(verifiedRow);

      const result = await service.create({ ...input, isVerified: true });

      const data = lastCreateData(prisma.user.create);
      expect(data.isVerified).toBe(true);
      expect(result.isVerified).toBe(true);
    });

    it('does not expose isActive as a settable field, even if the caller supplies one', async () => {
      prisma.user.create.mockResolvedValue(userRow);
      const maliciousInput = {
        ...input,
        isActive: false,
      } as typeof input & { isActive: boolean };

      await service.create(maliciousInput);

      const data = lastCreateData(prisma.user.create);
      expect(data).not.toHaveProperty('isActive');
    });

    it('always persists role as client for the sign-up path, regardless of other input properties', async () => {
      prisma.user.create.mockResolvedValue(userRow);
      const signupLikeInput = {
        ...input,
        isActive: true,
        isVerified: true,
      };

      await service.create(signupLikeInput);

      const data = lastCreateData(prisma.user.create);
      expect(data.role).toBe(Role.client);
    });

    it('persists the caller-supplied role when input.role is set explicitly', async () => {
      const deliveryPersonRow = { ...userRow, role: Role.deliveryPerson };
      prisma.user.create.mockResolvedValue(deliveryPersonRow);

      const result = await service.create({
        ...input,
        role: Role.deliveryPerson,
      });

      const data = lastCreateData(prisma.user.create);
      expect(data.role).toBe(Role.deliveryPerson);
      expect(result.role).toBe(Role.deliveryPerson);
    });

    it('defaults role to client when input.role is not provided', async () => {
      prisma.user.create.mockResolvedValue(userRow);

      await service.create(input);

      const data = lastCreateData(prisma.user.create);
      expect(data.role).toBe(Role.client);
    });

    it('resolves to a UserEntity built from the created row', async () => {
      prisma.user.create.mockResolvedValue(userRow);

      const result = await service.create(input);

      expect(result).toBeInstanceOf(UserEntity);
      expect(result).toEqual(new UserEntity(userRow));
      expect(result.userId).toBe(userRow.id);
      expect(result.email).toBe(userRow.email);
      expect(result.fullName).toBe(userRow.fullName);
      expect(result.role).toBe(userRow.role);
      expect(result.isActive).toBe(userRow.isActive);
      expect(result.isVerified).toBe(userRow.isVerified);
      expect(result.createdAt).toEqual(userRow.createdAt);
      expect(result.updatedAt).toEqual(userRow.updatedAt);
    });

    it('propagates the error when prisma.user.create rejects (e.g. unique constraint violation)', async () => {
      const dbError = new Error(
        'Unique constraint failed on the fields: (`email`)',
      );
      prisma.user.create.mockRejectedValue(dbError);

      await expect(service.create(input)).rejects.toThrow(dbError);
    });
  });

  describe('findByEmail', () => {
    it('calls prisma.user.findUnique with the given email', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow);

      await service.findByEmail('jane@example.com');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'jane@example.com' },
      });
    });

    it('resolves to a UserEntity when a row is found', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow);

      const result = await service.findByEmail('jane@example.com');

      expect(result).toBeInstanceOf(UserEntity);
      expect(result).toEqual(new UserEntity(userRow));
    });

    it('resolves to null when no row is found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.findByEmail('missing@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('calls prisma.user.findUnique with the given id', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow);

      await service.findById('user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });

    it('resolves to a UserEntity when a row is found', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow);

      const result = await service.findById('user-1');

      expect(result).toBeInstanceOf(UserEntity);
      expect(result).toEqual(new UserEntity(userRow));
    });

    it('resolves to null when no row is found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.findById('missing-id');

      expect(result).toBeNull();
    });
  });

  describe('markVerified', () => {
    it('calls prisma.user.update with the exact where/data shape', async () => {
      prisma.user.update.mockResolvedValue({ ...userRow, isVerified: true });

      await service.markVerified('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isVerified: true },
      });
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });

    it('resolves to a UserEntity reflecting isVerified: true', async () => {
      const updatedRow = { ...userRow, isVerified: true };
      prisma.user.update.mockResolvedValue(updatedRow);

      const result = await service.markVerified('user-1');

      expect(result).toBeInstanceOf(UserEntity);
      expect(result).toEqual(new UserEntity(updatedRow));
      expect(result.isVerified).toBe(true);
    });
  });

  describe('updatePassword', () => {
    const NEW_PASSWORD = 'new-plaintext-password';

    it('hashes the new password using the configured bcrypt salt rounds', async () => {
      prisma.user.update.mockResolvedValue({
        ...userRow,
        password: HASHED_PASSWORD,
      });

      await service.updatePassword('user-1', NEW_PASSWORD);

      expect(configService.getOrThrow).toHaveBeenCalledWith(
        'auth.bcryptSaltRounds',
      );
      expect(hashMock).toHaveBeenCalledWith(NEW_PASSWORD, SALT_ROUNDS);
    });

    it('persists the hashed password, never the plaintext password', async () => {
      prisma.user.update.mockResolvedValue({
        ...userRow,
        password: HASHED_PASSWORD,
      });

      await service.updatePassword('user-1', NEW_PASSWORD);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { password: HASHED_PASSWORD },
      });
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });

    it('resolves to undefined', async () => {
      prisma.user.update.mockResolvedValue({
        ...userRow,
        password: HASHED_PASSWORD,
      });

      const result = await service.updatePassword('user-1', NEW_PASSWORD);

      expect(result).toBeUndefined();
    });

    it('propagates the error when prisma.user.update rejects', async () => {
      const dbError = new Error('Record to update not found.');
      prisma.user.update.mockRejectedValue(dbError);

      await expect(
        service.updatePassword('user-1', NEW_PASSWORD),
      ).rejects.toThrow(dbError);
    });
  });

  describe('createPasswordResetToken', () => {
    const USER_ID = 'user-1';
    const HASHED_TOKEN = 'hashed-reset-token';
    const EXPIRES_AT = new Date('2024-06-01T00:00:00.000Z');

    it('deletes previously unused reset tokens for the user and creates the new one atomically', async () => {
      prisma.userAuth.deleteMany.mockResolvedValue({ count: 1 });
      prisma.userAuth.create.mockResolvedValue({
        id: 'auth-1',
        userId: USER_ID,
        token: HASHED_TOKEN,
        usedAt: null,
        expiresAt: EXPIRES_AT,
      });

      await service.createPasswordResetToken(USER_ID, HASHED_TOKEN, EXPIRES_AT);

      expect(prisma.userAuth.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, usedAt: null },
      });
      expect(prisma.userAuth.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          token: HASHED_TOKEN,
          expiresAt: EXPIRES_AT,
        },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const [ops] = prisma.$transaction.mock.calls[0] as [unknown[]];
      expect(ops).toHaveLength(2);
    });

    it('resolves to undefined', async () => {
      prisma.userAuth.deleteMany.mockResolvedValue({ count: 0 });
      prisma.userAuth.create.mockResolvedValue({
        id: 'auth-1',
        userId: USER_ID,
        token: HASHED_TOKEN,
        usedAt: null,
        expiresAt: EXPIRES_AT,
      });

      const result = await service.createPasswordResetToken(
        USER_ID,
        HASHED_TOKEN,
        EXPIRES_AT,
      );

      expect(result).toBeUndefined();
    });

    it('does not hash the token itself (the caller is responsible for hashing)', async () => {
      prisma.userAuth.deleteMany.mockResolvedValue({ count: 0 });
      prisma.userAuth.create.mockResolvedValue({
        id: 'auth-1',
        userId: USER_ID,
        token: HASHED_TOKEN,
        usedAt: null,
        expiresAt: EXPIRES_AT,
      });
      hashMock.mockClear();

      await service.createPasswordResetToken(USER_ID, HASHED_TOKEN, EXPIRES_AT);

      expect(hashMock).not.toHaveBeenCalled();
    });

    it('propagates the error when the transaction rejects', async () => {
      const dbError = new Error('Transaction failed');
      prisma.userAuth.deleteMany.mockResolvedValue({ count: 0 });
      prisma.userAuth.create.mockResolvedValue({});
      prisma.$transaction.mockRejectedValue(dbError);

      await expect(
        service.createPasswordResetToken(USER_ID, HASHED_TOKEN, EXPIRES_AT),
      ).rejects.toThrow(dbError);
    });
  });

  describe('findValidPasswordResetToken', () => {
    const HASHED_TOKEN = 'hashed-reset-token';

    it('calls prisma.userAuth.findFirst with the exact where/select shape', async () => {
      prisma.userAuth.findFirst.mockResolvedValue({
        id: 'auth-1',
        userId: 'user-1',
      });

      await service.findValidPasswordResetToken(HASHED_TOKEN);

      expect(prisma.userAuth.findFirst).toHaveBeenCalledWith({
        where: {
          token: HASHED_TOKEN,
          usedAt: null,
          expiresAt: { gt: expect.any(Date) as Date },
        },
        select: { id: true, userId: true },
      });
      expect(prisma.userAuth.findFirst).toHaveBeenCalledTimes(1);
    });

    it('resolves to the row when a valid token is found', async () => {
      const row = { id: 'auth-1', userId: 'user-1' };
      prisma.userAuth.findFirst.mockResolvedValue(row);

      const result = await service.findValidPasswordResetToken(HASHED_TOKEN);

      expect(result).toEqual(row);
    });

    it('resolves to null when no valid token is found', async () => {
      prisma.userAuth.findFirst.mockResolvedValue(null);

      const result = await service.findValidPasswordResetToken(HASHED_TOKEN);

      expect(result).toBeNull();
    });
  });

  describe('consumePasswordResetToken', () => {
    it('calls prisma.userAuth.update with the exact where shape and a Date usedAt', async () => {
      prisma.userAuth.update.mockResolvedValue({
        id: 'auth-1',
        userId: 'user-1',
        usedAt: new Date(),
      });

      await service.consumePasswordResetToken('auth-1');

      expect(prisma.userAuth.update).toHaveBeenCalledWith({
        where: { id: 'auth-1' },
        data: { usedAt: expect.any(Date) as Date },
      });
      expect(prisma.userAuth.update).toHaveBeenCalledTimes(1);
    });

    it('resolves to undefined', async () => {
      prisma.userAuth.update.mockResolvedValue({
        id: 'auth-1',
        userId: 'user-1',
        usedAt: new Date(),
      });

      const result = await service.consumePasswordResetToken('auth-1');

      expect(result).toBeUndefined();
    });

    it('propagates the error when prisma.userAuth.update rejects', async () => {
      const dbError = new Error('Record to update not found.');
      prisma.userAuth.update.mockRejectedValue(dbError);

      await expect(service.consumePasswordResetToken('auth-1')).rejects.toThrow(
        dbError,
      );
    });
  });
});
