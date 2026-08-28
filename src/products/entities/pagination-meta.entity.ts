import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'PaginationMeta' })
export class PaginationMetaEntity {
  @ApiProperty()
  limit: number;

  @ApiProperty()
  offset: number;

  @ApiProperty()
  total: number;

  constructor(partial: PaginationMetaEntity) {
    Object.assign(this, partial);
  }
}
