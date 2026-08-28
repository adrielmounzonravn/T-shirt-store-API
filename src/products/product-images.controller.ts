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
import { ProductImageEntity } from './entities/product-image.entity.js';
import { ProductImagesService } from './product-images.service.js';

@ApiTags('Product Images')
@Controller('products')
export class ProductImagesController {
  constructor(private readonly productImagesService: ProductImagesService) {}

  @Post(':productId/images')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'ProductImage'))
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: 'Upload product image (Manager)',
    description:
      'Uploads the image to S3 and stores the key (image_path) in the product_images table. ' +
      'If isCover is true, unsets isCover on any other image of the same product first.',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
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
    type: ProductImageEntity,
  })
  @ApiErrorResponses(401, 403)
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
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: 'Set an existing product image as cover (Manager)',
    description:
      'Sets isCover=true on this image and isCover=false on any other image of the same product.',
  })
  @ApiParam({ name: 'imageId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Image updated',
    type: ProductImageEntity,
  })
  @ApiErrorResponses(401, 403, 404)
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
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Delete product image (Manager)' })
  @ApiParam({ name: 'imageId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Image deleted' })
  @ApiErrorResponses(401, 403, 404)
  remove(@Param('imageId', ParseUUIDPipe) imageId: string): Promise<void> {
    return this.productImagesService.remove(imageId);
  }
}
