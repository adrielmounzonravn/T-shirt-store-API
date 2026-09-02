import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ResetTokenCleanupCron } from './reset-token-cleanup.cron.js';
import { UsersService } from './users.service.js';

describe('ResetTokenCleanupCron', () => {
  let cron: ResetTokenCleanupCron;
  let usersService: {
    deleteExpiredResetTokens: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    usersService = {
      deleteExpiredResetTokens: vi.fn().mockResolvedValue(0),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ResetTokenCleanupCron, UsersService],
    })
      .overrideProvider(UsersService)
      .useValue(usersService)
      .compile();

    cron = moduleRef.get(ResetTokenCleanupCron);
  });

  describe('sweep', () => {
    it('calls deleteExpiredResetTokens exactly once', async () => {
      await cron.sweep();
      expect(usersService.deleteExpiredResetTokens).toHaveBeenCalledTimes(1);
    });

    it('calls deleteExpiredResetTokens with no arguments', async () => {
      await cron.sweep();
      expect(usersService.deleteExpiredResetTokens).toHaveBeenCalledWith();
    });

    it('resolves without throwing when deleteExpiredResetTokens succeeds', async () => {
      usersService.deleteExpiredResetTokens.mockResolvedValue(5);
      await expect(cron.sweep()).resolves.toBeUndefined();
    });

    it('resolves without throwing when deleteExpiredResetTokens resolves with zero deletions', async () => {
      usersService.deleteExpiredResetTokens.mockResolvedValue(0);
      await expect(cron.sweep()).resolves.toBeUndefined();
    });

    it('resolves without throwing when deleteExpiredResetTokens rejects', async () => {
      usersService.deleteExpiredResetTokens.mockRejectedValue(
        new Error('database unreachable'),
      );
      await expect(cron.sweep()).resolves.toBeUndefined();
    });
  });
});
