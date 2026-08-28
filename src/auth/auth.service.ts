import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CreateUserInput, UsersService } from '../users/users.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { MailService } from '../mail/mail.service.js';
import {
  EmailVerificationPayload,
  JwtPayload,
} from './jwt-payload.interface.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async signUp(input: CreateUserInput): Promise<UserEntity> {
    const user = await this.usersService.create(input);

    const verificationToken = this.signEmailVerificationToken(user.id);
    await this.mailService.sendVerificationEmail(user.email, verificationToken);

    return user;
  }

  async verifyEmail(token: string): Promise<void> {
    let payload: EmailVerificationPayload;
    try {
      payload = this.jwtService.verify<EmailVerificationPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (payload.purpose !== 'email-verification') {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || user.isVerified) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    await this.usersService.markVerified(user.id);
  }

  private signEmailVerificationToken(userId: string): string {
    const payload: EmailVerificationPayload = {
      sub: userId,
      purpose: 'email-verification',
    };
    const ttlHours = this.configService.getOrThrow<number>(
      'auth.emailVerificationTokenTtlHours',
    );
    return this.jwtService.sign(payload, { expiresIn: ttlHours * 3600 });
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
