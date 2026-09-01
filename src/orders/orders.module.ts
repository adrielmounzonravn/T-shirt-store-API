import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CaslModule } from '../casl/casl.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [PrismaModule, PassportModule.register({}), CaslModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
