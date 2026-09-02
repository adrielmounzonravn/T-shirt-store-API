import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UsersService } from './users.service.js';

@Injectable()
export class ResetTokenCleanupCron {
  private readonly logger = new Logger(ResetTokenCleanupCron.name);
  constructor(private readonly usersService: UsersService) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'reset-token-cleanup' })
  async sweep(): Promise<void> {
    try {
      const count = await this.usersService.deleteExpiredResetTokens();
      this.logger.log(`Deleted ${count} expired reset token(s)`);
    } catch (error) {
      this.logger.error(
        'Reset-token cleanup failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
