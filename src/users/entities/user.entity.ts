import { Exclude } from 'class-transformer';
import { ApiHideProperty, ApiProperty, ApiSchema } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';

interface UserSource {
  id: string;
  email: string;
  password: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@ApiSchema({ name: 'User' })
export class UserEntity {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiHideProperty()
  @Exclude()
  password: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty({ enum: Role, enumName: 'Role', default: Role.client })
  role: Role;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ default: false })
  isVerified: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  constructor(partial: UserSource) {
    this.userId = partial.id;
    this.email = partial.email;
    this.password = partial.password;
    this.fullName = partial.fullName;
    this.role = partial.role;
    this.isActive = partial.isActive;
    this.isVerified = partial.isVerified;
    this.createdAt = partial.createdAt;
    this.updatedAt = partial.updatedAt;
  }
}
