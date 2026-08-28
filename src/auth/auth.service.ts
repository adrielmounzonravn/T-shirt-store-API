import { ForbiddenException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CreateUserInput, UsersService } from '../users/users.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { JwtPayload } from './jwt-payload.interface.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async signUp(input: CreateUserInput): Promise<UserEntity> {
    return this.usersService.create(input);
  }

  async validateUser(
    email: string,
    password: string,
  ): Promise<UserEntity | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return null;
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    return passwordMatches ? user : null;
  }

  signIn(user: UserEntity): { accessToken: string } {
    if (!user.isVerified) {
      throw new ForbiddenException('Email is not verified yet');
    }

    const payload: JwtPayload = { sub: user.id, role: user.role };
    return { accessToken: this.jwtService.sign(payload) };
  }
}
