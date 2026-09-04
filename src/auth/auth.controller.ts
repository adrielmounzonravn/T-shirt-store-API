import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { SignUpDto } from './dto/signup.dto.js';
import { SignInDto } from './dto/signin.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { LocalAuthGuard } from './guards/local-auth.guard.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator.js';

const STRICT_AUTH_THROTTLE = {
  default: {
    limit: Number(process.env.THROTTLE_RESET_PASSWORD_LIMIT),
    ttl: Number(process.env.THROTTLE_RESET_PASSWORD_TTL) * 1000,
  },
};

@ApiTags('Auth')
@Controller('auth')
@UseInterceptors(ClassSerializerInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Sign up',
    description:
      'Sends a verification email with a token; the account cannot sign in until verified.',
  })
  @ApiResponse({ status: 201, description: 'User created', type: UserEntity })
  @ApiErrorResponses(400, 409)
  async signUp(@Body() dto: SignUpDto): Promise<UserEntity> {
    return this.authService.signUp(dto);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  @Throttle(STRICT_AUTH_THROTTLE)
  @ApiOperation({ summary: 'Sign in' })
  @ApiResponse({
    status: 200,
    description: 'Authenticated',
    schema: {
      type: 'object',
      properties: { accessToken: { type: 'string' } },
    },
  })
  @ApiErrorResponses(401)
  @ApiResponse({
    status: 403,
    description: 'Account exists but email is not verified yet',
  })
  signIn(
    @Body() _dto: SignInDto,
    @Req() req: Request,
  ): { accessToken: string } {
    return this.authService.signIn(req.user as UserEntity);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with token' })
  @ApiResponse({ status: 200, description: 'Email verified' })
  @ApiResponse({
    status: 401,
    description: 'Invalid, expired, or already used token',
  })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.authService.verifyEmail(dto.token);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle(STRICT_AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Request password reset',
    description:
      'Generates a reset token and sends an email with the link. Subject to rate limiting.',
  })
  @ApiResponse({
    status: 202,
    description:
      'Reset email sent (always responds 202 regardless of whether the email exists, to avoid leaking account existence)',
  })
  @ApiErrorResponses(429)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle(STRICT_AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Reset password with token',
    description:
      'Subject to rate limiting. On completion, sends an email notifying the password change.',
  })
  @ApiResponse({ status: 200, description: 'Password updated' })
  @ApiErrorResponses(400, 429)
  @ApiResponse({
    status: 401,
    description: 'Invalid, expired, or already used token',
  })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(dto.token, dto.newPassword);
  }
}
