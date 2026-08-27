import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('HealthController', () => {
  let healthController: HealthController;
  let queryRawMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    queryRawMock = vi.fn();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: { $queryRaw: queryRawMock },
        },
      ],
    }).compile();

    healthController = app.get<HealthController>(HealthController);
  });

  describe('check', () => {
    it('returns { status: "ok" } when the DB query succeeds', async () => {
      queryRawMock.mockResolvedValue(undefined);

      await expect(healthController.check()).resolves.toEqual({
        status: 'ok',
      });
    });

    it('throws ServiceUnavailableException when the DB query rejects', async () => {
      queryRawMock.mockRejectedValue(new Error('connection refused'));

      await expect(healthController.check()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
