import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { JwtPayload } from '../jwt-payload.interface.js';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = JwtPayload>(
    _err: unknown,
    user: TUser | false,
  ): TUser | undefined {
    return user || undefined;
  }
}
