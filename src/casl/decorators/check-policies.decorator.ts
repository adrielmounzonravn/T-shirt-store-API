import { SetMetadata } from '@nestjs/common';
import type { AppAbility } from '../casl-ability.factory.js';

export type PolicyHandlerCallback = (ability: AppAbility) => boolean;

export const CHECK_POLICIES_KEY = 'check_policies';
export const CheckPolicies = (...handlers: PolicyHandlerCallback[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);
