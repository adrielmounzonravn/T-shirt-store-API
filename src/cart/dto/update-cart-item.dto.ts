import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

@ApiSchema({ name: 'CartItemUpdateInput' })
export class UpdateCartItemDto {
  @ApiProperty({ type: 'integer', minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}
