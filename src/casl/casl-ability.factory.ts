import { Injectable } from '@nestjs/common';
import { Ability, AbilityBuilder, type AbilityClass } from '@casl/ability';
import { Role } from '../generated/prisma/enums.js';

export type Subjects =
  | 'Product'
  | 'ProductVariant'
  | 'ProductImage'
  | 'VariantImage'
  | 'LikedProduct'
  | 'Cart'
  | 'Order'
  | 'all';
export type Action =
  'manage' | 'create' | 'read' | 'update' | 'delete' | 'cancel';
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

    switch (user.role) {
      case Role.manager:
        can('manage', 'Product');
        can('manage', 'ProductVariant');
        can('manage', 'ProductImage');
        can('manage', 'VariantImage');
        can('read', 'Order');
        can('update', 'Order');
        break;
      case Role.client:
        can('read', 'Product');
        can('read', 'ProductVariant');
        can('create', 'LikedProduct');
        can('delete', 'LikedProduct');
        can('read', 'Cart');
        can('create', 'Cart');
        can('update', 'Cart');
        can('delete', 'Cart');
        can('create', 'Order');
        can('read', 'Order');
        can('cancel', 'Order');
        break;
      case Role.deliveryPerson:
        break;
      default:
        break;
    }

    return build();
  }
}
