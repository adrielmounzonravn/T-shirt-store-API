import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserEntity } from './entities/user.entity.js';
import { Role } from '../generated/prisma/enums.js';

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  role?: Role;
  isVerified?: boolean;
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
        role: input.role ?? Role.client,
        isVerified: input.isVerified ?? false,
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

  async markVerified(id: string): Promise<UserEntity> {
    const user = await this.prisma.user.update({
      where: { id },
      data: { isVerified: true },
    });
    return new UserEntity(user);
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const saltRounds = this.configService.getOrThrow<number>(
      'auth.bcryptSaltRounds',
    );
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });
  }

  async createPasswordResetToken(
    userId: string,
    hashedToken: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.userAuth.deleteMany({
        where: { userId, usedAt: null },
      }),
      this.prisma.userAuth.create({
        data: { userId, token: hashedToken, expiresAt },
      }),
    ]);
  }

  async findValidPasswordResetToken(
    hashedToken: string,
  ): Promise<{ id: string; userId: string } | null> {
    return this.prisma.userAuth.findFirst({
      where: {
        token: hashedToken,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, userId: true },
    });
  }

  async consumePasswordResetToken(id: string): Promise<void> {
    await this.prisma.userAuth.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  async deleteExpiredResetTokens(): Promise<number> {
    const { count } = await this.prisma.userAuth.deleteMany({
      where: { usedAt: null, expiresAt: { lt: new Date() } },
    });
    return count;
  }
}
