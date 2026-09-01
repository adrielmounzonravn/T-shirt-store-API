import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { PoliciesGuard } from '../casl/guards/policies.guard.js';
import { CheckPolicies } from '../casl/decorators/check-policies.decorator.js';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator.js';
import { ListLikedProductsQueryDto } from './dto/list-liked-products-query.dto.js';
import { LikedProductsListEntity } from './entities/liked-products-list.entity.js';
import { LikedProductsService } from './liked-products.service.js';

@ApiTags('Likes')
@ApiBearerAuth('bearerAuth')
@Controller('me/liked-products')
@UseGuards(JwtAuthGuard)
export class LikedProductsController {
  constructor(private readonly likedProductsService: LikedProductsService) {}

  @Get()
  @ApiOperation({
    summary: 'List product IDs liked by the current user',
    description:
      'Returns only productIds, not full Product objects — meant to be ' +
      'called in parallel with GET /products so the client can build a Set ' +
      'of liked productIds, not to render a full listing page.',
  })
  @ApiResponse({
    status: 200,
    description: 'Liked product IDs',
    type: LikedProductsListEntity,
  })
  @ApiErrorResponses(401)
  findMany(
    @Query() query: ListLikedProductsQueryDto,
    @CurrentUser('sub') userId: string,
  ): Promise<LikedProductsListEntity> {
    return this.likedProductsService.findMany(userId, query);
  }

  @Put(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'LikedProduct'))
  @ApiOperation({
    summary: 'Like a product (Client)',
    description:
      'Upserts (userId, productId); idempotent — liking an already liked ' +
      'product is a no-op that still returns 204.',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Liked (or already liked)' })
  @ApiErrorResponses(401, 403, 404)
  like(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<void> {
    return this.likedProductsService.like(userId, productId);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('delete', 'LikedProduct'))
  @ApiOperation({
    summary: 'Unlike a product (Client)',
    description:
      'Deletes (userId, productId); idempotent — unliking a product that ' +
      'was not liked still returns 204.',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Unliked (or was not liked)' })
  @ApiErrorResponses(401, 403)
  unlike(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<void> {
    return this.likedProductsService.unlike(userId, productId);
  }
}
