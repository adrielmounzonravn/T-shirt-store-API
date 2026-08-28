import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CaslAbilityFactory } from '../casl-ability.factory.js';
import {
  CHECK_POLICIES_KEY,
  type PolicyHandlerCallback,
} from '../decorators/check-policies.decorator.js';
import type { JwtPayload } from '../../auth/jwt-payload.interface.js';

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const policyHandlers =
      this.reflector.getAllAndOverride<PolicyHandlerCallback[] | undefined>(
        CHECK_POLICIES_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    if (policyHandlers.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    const ability = this.caslAbilityFactory.createForUser({
      id: request.user.sub,
      role: request.user.role,
    });

    return policyHandlers.every((handler) => handler(ability));
  }
}
