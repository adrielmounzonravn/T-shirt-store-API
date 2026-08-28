import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CaslModule } from '../casl/casl.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { ProductImagesController } from './product-images.controller.js';
import { ProductImagesService } from './product-images.service.js';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({}),
    CaslModule,
    StorageModule,
  ],
  controllers: [ProductsController, ProductImagesController],
  providers: [ProductsService, ProductImagesService],
  exports: [ProductsService],
})
export class ProductsModule {}
