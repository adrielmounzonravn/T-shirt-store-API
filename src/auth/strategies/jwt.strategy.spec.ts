import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy.js';
import { JwtPayload } from '../jwt-payload.interface.js';
import { Role } from '../../generated/prisma/enums.js';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let configService: { getOrThrow: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    configService = {
      getOrThrow: vi.fn().mockReturnValue('test-secret'),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [JwtStrategy, ConfigService],
    })
      .overrideProvider(ConfigService)
      .useValue(configService)
      .compile();

    strategy = moduleRef.get(JwtStrategy);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reads the JWT secret from config during construction', () => {
    expect(configService.getOrThrow).toHaveBeenCalledWith('auth.jwtSecret');
  });

  describe('validate', () => {
    it('returns the payload unchanged for a client', () => {
      const payload: JwtPayload = {
        sub: 'user-1',
        role: Role.client,
      };

      const result = strategy.validate(payload);

      expect(result).toEqual(payload);
    });

    it('returns the payload unchanged for a manager', () => {
      const payload: JwtPayload = {
        sub: 'user-2',
        role: Role.manager,
      };

      const result = strategy.validate(payload);

      expect(result).toEqual(payload);
    });
  });
});
