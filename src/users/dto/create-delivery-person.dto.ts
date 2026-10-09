import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';

const CREATABLE_ROLES = [Role.deliveryPerson] as const;
export type CreatableRole = (typeof CREATABLE_ROLES)[number];

export class CreateDeliveryPersonDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ enum: CREATABLE_ROLES, enumName: 'CreatableRole' })
  @IsIn(CREATABLE_ROLES)
  role: CreatableRole;
}
