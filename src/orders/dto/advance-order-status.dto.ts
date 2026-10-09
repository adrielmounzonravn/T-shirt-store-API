import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '../../generated/prisma/enums.js';

const ADVANCEABLE_STATUSES = [
  OrderStatus.processing,
  OrderStatus.shipped,
  OrderStatus.delivered,
] as const;
export type AdvanceableOrderStatus = (typeof ADVANCEABLE_STATUSES)[number];

export class AdvanceOrderStatusDto {
  @ApiProperty({
    enum: ADVANCEABLE_STATUSES,
    enumName: 'AdvanceableOrderStatus',
  })
  @IsIn(ADVANCEABLE_STATUSES)
  status: AdvanceableOrderStatus;
}
