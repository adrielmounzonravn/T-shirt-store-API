import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CaslModule } from '../casl/casl.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { VariantsController } from './variants.controller.js';
import { SkuController } from './sku.controller.js';
import { VariantsService } from './variants.service.js';
import { VariantImagesController } from './variant-images.controller.js';
import { VariantImagesService } from './variant-images.service.js';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({}),
    CaslModule,
    StorageModule,
  ],
  controllers: [VariantsController, SkuController, VariantImagesController],
  providers: [VariantsService, VariantImagesService],
  exports: [VariantsService],
})
export class VariantsModule {}
