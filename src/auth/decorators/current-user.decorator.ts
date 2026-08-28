import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '../jwt-payload.interface.js';

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return data ? request.user[data] : request.user;
  },
);
