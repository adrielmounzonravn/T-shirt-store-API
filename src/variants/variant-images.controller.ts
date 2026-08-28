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
import { VariantImageEntity } from '../products/entities/variant-image.entity.js';
import { VariantImagesService } from './variant-images.service.js';

@Controller('variants')
export class VariantImagesController {
  constructor(private readonly variantImagesService: VariantImagesService) {}

  @Post(':skuId/images')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'VariantImage'))
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  upload(
    @Param('skuId', ParseUUIDPipe) skuId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadImageDto,
  ): Promise<VariantImageEntity> {
    return this.variantImagesService.upload(skuId, file, dto);
  }

  @Patch('images/:imageId')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'VariantImage'))
  setCover(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Body() dto: SetCoverImageDto,
  ): Promise<VariantImageEntity> {
    return this.variantImagesService.setCover(imageId, dto);
  }

  @Delete('images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'VariantImage'))
  remove(@Param('imageId', ParseUUIDPipe) imageId: string): Promise<void> {
    return this.variantImagesService.remove(imageId);
  }
}
