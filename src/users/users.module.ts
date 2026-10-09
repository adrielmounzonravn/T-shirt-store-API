import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CaslModule } from '../casl/casl.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { ResetTokenCleanupCron } from './reset-token-cleanup.cron.js';

@Module({
  imports: [PrismaModule, PassportModule.register({}), CaslModule],
  controllers: [UsersController],
  providers: [UsersService, ResetTokenCleanupCron],
  exports: [UsersService],
})
export class UsersModule {}
