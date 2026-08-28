import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';
import { CreateProductVariantDto } from './create-product-variant.dto.js';

@ApiSchema({ name: 'ProductCreateInput' })
export class CreateProductDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  detail?: string;

  @ApiPropertyOptional({
    type: [CreateProductVariantDto],
    minItems: 1,
    maxItems: 50,
    description: `Optional. When present, the SKUs are created together with the product
in one transaction and the product is created with status=enabled.
When omitted, the product is created with status=disabled and has no
SKUs yet. Each entry must have a distinct size/color/fit/gender
combination.`,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants?: CreateProductVariantDto[];
}
