import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CaslModule } from '../casl/casl.module.js';
import { LikedProductsController } from './liked-products.controller.js';
import { LikedProductsService } from './liked-products.service.js';

@Module({
  imports: [PrismaModule, PassportModule.register({}), CaslModule],
  controllers: [LikedProductsController],
  providers: [LikedProductsService],
})
export class LikedProductsModule {}
