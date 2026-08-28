import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'ProductVariantUpdateInput' })
export class UpdateProductVariantDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({
    format: 'float',
    minimum: 0.01,
    maximum: 9999.99,
    multipleOf: 0.01,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  price?: number;
}
