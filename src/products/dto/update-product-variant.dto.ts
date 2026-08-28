import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateProductVariantDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  price?: number;
}
