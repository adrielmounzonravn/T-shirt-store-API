import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignDeliveryPersonDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  deliveryPersonId: string;
}
