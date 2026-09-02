import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersService } from './users.service.js';
import { ResetTokenCleanupCron } from './reset-token-cleanup.cron.js';

@Module({
  imports: [PrismaModule],
  providers: [UsersService, ResetTokenCleanupCron],
  exports: [UsersService],
})
export class UsersModule {}
