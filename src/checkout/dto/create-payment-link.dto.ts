import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

@ApiSchema({ name: 'PaymentLinkCreateInput' })
export class CreatePaymentLinkDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  skuId: string;

  @ApiProperty({ type: 'integer', minimum: 1, default: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}
