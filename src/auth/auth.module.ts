import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';
import { UsersModule } from '../users/users.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LocalStrategy } from './strategies/local.strategy.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [
    UsersModule,
    MailModule,
    PassportModule.register({}),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('auth.jwtSecret'),
        signOptions: {
          expiresIn: configService.getOrThrow<StringValue>('auth.jwtExpiresIn'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy],
})
export class AuthModule {}
