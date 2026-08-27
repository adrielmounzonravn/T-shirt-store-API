import { Exclude } from 'class-transformer';
import { Role } from '../../generated/prisma/enums.js';

export class UserEntity {
  id: string;
  email: string;

  @Exclude()
  password: string;

  fullName: string;
  role: Role;
  isActive: boolean;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}
