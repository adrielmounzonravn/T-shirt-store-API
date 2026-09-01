import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CaslModule } from '../casl/casl.module.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';

@Module({
  imports: [PrismaModule, PassportModule.register({}), CaslModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
