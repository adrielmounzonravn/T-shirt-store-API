import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
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

    const verificationToken = this.signEmailVerificationToken(user.userId);
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

    await this.usersService.markVerified(user.userId);
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

    const payload: JwtPayload = { sub: user.userId, role: user.role };
    return { accessToken: this.jwtService.sign(payload) };
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return;
    }

    const rawToken = randomBytes(32).toString('hex');
    const ttlHours = this.configService.getOrThrow<number>(
      'auth.resetTokenTtlHours',
    );
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

    await this.usersService.createPasswordResetToken(
      user.userId,
      this.hashResetToken(rawToken),
      expiresAt,
    );
    await this.mailService.sendPasswordResetEmail(user.email, rawToken);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const resetToken = await this.usersService.findValidPasswordResetToken(
      this.hashResetToken(token),
    );
    if (!resetToken) {
      throw new UnauthorizedException(
        'Invalid, expired, or already used token',
      );
    }

    await this.usersService.updatePassword(resetToken.userId, newPassword);
    await this.usersService.consumePasswordResetToken(resetToken.id);

    const user = await this.usersService.findById(resetToken.userId);
    if (user) {
      await this.mailService.sendPasswordChangedEmail(user.email);
    }
  }

  private hashResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
