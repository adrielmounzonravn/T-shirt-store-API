import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'ProductUpdateInput' })
export class UpdateProductDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  detail?: string;
}
