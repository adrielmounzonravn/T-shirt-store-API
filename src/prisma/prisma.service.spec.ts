import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  let connectSpy: ReturnType<typeof vi.spyOn>;
  let disconnectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    connectSpy = vi
      .spyOn(PrismaClient.prototype, '$connect')
      .mockResolvedValue(undefined);
    disconnectSpy = vi
      .spyOn(PrismaClient.prototype, '$disconnect')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createService(): PrismaService {
    const configService = {
      get: vi.fn().mockReturnValue('postgresql://user:pass@localhost:5432/db'),
    } as unknown as ConfigService;

    return new PrismaService(configService);
  }

  it('reads the databaseUrl config key when constructed', () => {
    const get = vi
      .fn()
      .mockReturnValue('postgresql://user:pass@localhost:5432/db');
    const configService = { get } as unknown as ConfigService;

    new PrismaService(configService);

    expect(get).toHaveBeenCalledWith('databaseUrl');
  });

  it('calls $connect exactly once on onModuleInit', async () => {
    const service = createService();

    await service.onModuleInit();

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(disconnectSpy).not.toHaveBeenCalled();
  });

  it('calls $disconnect exactly once on onModuleDestroy', async () => {
    const service = createService();

    await service.onModuleDestroy();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it('does not connect merely by constructing the service', () => {
    createService();

    expect(connectSpy).not.toHaveBeenCalled();
  });
});
