import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

@ApiSchema({ name: 'CartItemCreateInput' })
export class AddCartItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  skuId: string;

  @ApiProperty({ type: 'integer', minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}
