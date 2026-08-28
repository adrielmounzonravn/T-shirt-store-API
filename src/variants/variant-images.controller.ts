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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PoliciesGuard } from '../casl/guards/policies.guard.js';
import { CheckPolicies } from '../casl/decorators/check-policies.decorator.js';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator.js';
import { imageUploadOptions } from '../common/image-upload.options.js';
import { UploadImageDto } from '../common/dto/upload-image.dto.js';
import { SetCoverImageDto } from '../common/dto/set-cover-image.dto.js';
import { VariantImageEntity } from '../products/entities/variant-image.entity.js';
import { VariantImagesService } from './variant-images.service.js';

@ApiTags('Product Images')
@Controller('variants')
export class VariantImagesController {
  constructor(private readonly variantImagesService: VariantImagesService) {}

  @Post(':skuId/images')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'VariantImage'))
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: 'Upload variant image (Manager)',
    description:
      'Uploads the image to S3 and stores the key (image_path) in the variant_images table. ' +
      'If isCover is true, unsets isCover on any other image of the same SKU first.',
  })
  @ApiParam({ name: 'skuId', format: 'uuid' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        isCover: { type: 'boolean', default: false },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Image uploaded',
    type: VariantImageEntity,
  })
  @ApiErrorResponses(401, 403)
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
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: 'Set an existing variant image as cover (Manager)',
    description:
      'Sets isCover=true on this image and isCover=false on any other image of the same SKU.',
  })
  @ApiParam({ name: 'imageId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Image updated',
    type: VariantImageEntity,
  })
  @ApiErrorResponses(401, 403, 404)
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
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Delete variant image (Manager)' })
  @ApiParam({ name: 'imageId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Image deleted' })
  @ApiErrorResponses(401, 403, 404)
  remove(@Param('imageId', ParseUUIDPipe) imageId: string): Promise<void> {
    return this.variantImagesService.remove(imageId);
  }
}
