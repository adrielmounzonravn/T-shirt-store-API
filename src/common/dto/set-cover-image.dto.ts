import { Equals } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetCoverImageDto {
  @ApiProperty({ enum: [true] })
  @Equals(true)
  isCover: true;
}
