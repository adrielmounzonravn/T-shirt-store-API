import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  Color,
  Fit,
  Gender,
  ProductStatus,
  Size,
} from '../../generated/prisma/enums.js';

export class ListProductsQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;

  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender' })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: Size, enumName: 'Size' })
  @IsOptional()
  @IsEnum(Size)
  size?: Size;

  @ApiPropertyOptional({ enum: Fit, enumName: 'Fit' })
  @IsOptional()
  @IsEnum(Fit)
  fit?: Fit;

  @ApiPropertyOptional({ enum: Color, enumName: 'Color' })
  @IsOptional()
  @IsEnum(Color)
  color?: Color;

  @ApiPropertyOptional({
    enum: ProductStatus,
    enumName: 'ProductStatus',
    description: 'Only Manager can filter/view disabled products',
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
