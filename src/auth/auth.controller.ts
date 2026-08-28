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
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { SignUpDto } from './dto/signup.dto.js';
import { SignInDto } from './dto/signin.dto.js';
import { LocalAuthGuard } from './guards/local-auth.guard.js';
import { UserEntity } from '../users/entities/user.entity.js';

@Controller('auth')
@UseInterceptors(ClassSerializerInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signUp(@Body() dto: SignUpDto): Promise<UserEntity> {
    return this.authService.signUp(dto);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  signIn(
    @Body() _dto: SignInDto,
    @Req() req: Request,
  ): { accessToken: string } {
    return this.authService.signIn(req.user as UserEntity);
  }
}
