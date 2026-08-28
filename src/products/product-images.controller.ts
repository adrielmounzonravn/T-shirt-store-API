import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PoliciesGuard } from '../casl/guards/policies.guard.js';
import { CheckPolicies } from '../casl/decorators/check-policies.decorator.js';
import { imageUploadOptions } from '../common/image-upload.options.js';
import { UploadImageDto } from '../common/dto/upload-image.dto.js';
import { SetCoverImageDto } from '../common/dto/set-cover-image.dto.js';
import { ProductImageEntity } from './entities/product-image.entity.js';
import { ProductImagesService } from './product-images.service.js';

@Controller('products')
export class ProductImagesController {
  constructor(private readonly productImagesService: ProductImagesService) {}

  @Post(':productId/images')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'ProductImage'))
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  upload(
    @Param('productId', ParseUUIDPipe) productId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadImageDto,
  ): Promise<ProductImageEntity> {
    return this.productImagesService.upload(productId, file, dto);
  }

  @Patch('images/:imageId')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'ProductImage'))
  setCover(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Body() dto: SetCoverImageDto,
  ): Promise<ProductImageEntity> {
    return this.productImagesService.setCover(imageId, dto);
  }

  @Delete('images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'ProductImage'))
  remove(@Param('imageId', ParseUUIDPipe) imageId: string): Promise<void> {
    return this.productImagesService.remove(imageId);
  }
}
