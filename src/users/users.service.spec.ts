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

    it('persists only email, hashed password, and fullName', async () => {
      prisma.user.create.mockResolvedValue(userRow);

      await service.create(input);

      const data = lastCreateData(prisma.user.create);
      expect(data).toEqual({
        email: input.email,
        password: HASHED_PASSWORD,
        fullName: input.fullName,
      });
    });

    it('does not forward a caller-supplied role, isActive, or isVerified to Prisma', async () => {
      prisma.user.create.mockResolvedValue(userRow);
      const maliciousInput = {
        ...input,
        role: 'manager',
        isActive: true,
        isVerified: true,
      };

      await service.create(maliciousInput);

      const data = lastCreateData(prisma.user.create);
      expect(data).not.toHaveProperty('role');
      expect(data).not.toHaveProperty('isActive');
      expect(data).not.toHaveProperty('isVerified');
    });

    it('resolves to a UserEntity built from the created row', async () => {
      prisma.user.create.mockResolvedValue(userRow);

      const result = await service.create(input);

      expect(result).toBeInstanceOf(UserEntity);
      expect(result).toEqual(new UserEntity(userRow));
      expect(result.id).toBe(userRow.id);
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
});
