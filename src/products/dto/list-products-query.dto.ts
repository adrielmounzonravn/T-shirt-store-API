import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  Color,
  Fit,
  Gender,
  ProductStatus,
  Size,
} from '../../generated/prisma/enums.js';

export class ListProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsEnum(Size)
  size?: Size;

  @IsOptional()
  @IsEnum(Fit)
  fit?: Fit;

  @IsOptional()
  @IsEnum(Color)
  color?: Color;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
