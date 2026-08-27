import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserEntity } from './entities/user.entity.js';

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async create(input: CreateUserInput): Promise<UserEntity> {
    const saltRounds = this.configService.getOrThrow<number>(
      'auth.bcryptSaltRounds',
    );
    const hashedPassword = await bcrypt.hash(input.password, saltRounds);

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        password: hashedPassword,
        fullName: input.fullName,
      },
    });

    return new UserEntity(user);
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? new UserEntity(user) : null;
  }

  async findById(id: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? new UserEntity(user) : null;
  }
}
