import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../products/entities/pagination-meta.entity.js';

export class LikedProductsListEntity {
  @ApiProperty({ type: [String], format: 'uuid' })
  data: string[];

  @ApiProperty({ type: PaginationMetaEntity })
  pagination: PaginationMetaEntity;

  constructor(partial: { data: string[]; pagination: PaginationMetaEntity }) {
    this.data = partial.data;
    this.pagination = new PaginationMetaEntity(partial.pagination);
  }
}
