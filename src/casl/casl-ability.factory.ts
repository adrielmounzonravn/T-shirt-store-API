import { Injectable } from '@nestjs/common';
import { Ability, AbilityBuilder, type AbilityClass } from '@casl/ability';
import { Role } from '../generated/prisma/enums.js';

export type Subjects = 'Product' | 'ProductVariant' | 'all';
export type Action = 'manage' | 'create' | 'read' | 'update' | 'delete';
export type AppAbility = Ability<[Action, Subjects]>;

export interface AbilityUser {
  id: string;
  role: Role;
}

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: AbilityUser): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(
      Ability as AbilityClass<AppAbility>,
    );

    if (user.role === Role.manager) {
      can('manage', 'Product');
      can('manage', 'ProductVariant');
    } else {
      can('read', 'Product');
      can('read', 'ProductVariant');
    }

    return build();
  }
}
