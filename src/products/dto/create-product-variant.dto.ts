import { IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';
import { Color, Fit, Gender, Size } from '../../generated/prisma/enums.js';

@ApiSchema({ name: 'ProductVariantCreateInput' })
export class CreateProductVariantDto {
  @ApiProperty({ enum: Size, enumName: 'Size' })
  @IsEnum(Size)
  size: Size;

  @ApiProperty({ enum: Color, enumName: 'Color' })
  @IsEnum(Color)
  color: Color;

  @ApiProperty({ enum: Fit, enumName: 'Fit' })
  @IsEnum(Fit)
  fit: Fit;

  @ApiProperty({ enum: Gender, enumName: 'Gender' })
  @IsEnum(Gender)
  gender: Gender;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock: number = 0;

  @ApiProperty({
    format: 'float',
    minimum: 0.01,
    maximum: 9999.99,
    multipleOf: 0.01,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  price: number;
}
