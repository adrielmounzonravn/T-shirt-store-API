import { IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Color, Fit, Gender, Size } from '../../generated/prisma/enums.js';

export class CreateProductVariantDto {
  @IsEnum(Size)
  size: Size;

  @IsEnum(Color)
  color: Color;

  @IsEnum(Fit)
  fit: Fit;

  @IsEnum(Gender)
  gender: Gender;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock: number = 0;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  price: number;
}
