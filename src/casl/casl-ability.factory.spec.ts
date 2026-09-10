import { describe, it, expect } from 'vitest';
import { CaslAbilityFactory } from './casl-ability.factory.js';
import { Role } from '../generated/prisma/enums.js';

describe('CaslAbilityFactory', () => {
  describe('manager', () => {
    it('can manage/create/read/update/delete Product', () => {
      const factory = new CaslAbilityFactory();
      const ability = factory.createForUser({
        id: 'user-1',
        role: Role.manager,
      });

      expect(ability.can('manage', 'Product')).toBe(true);
      expect(ability.can('create', 'Product')).toBe(true);
      expect(ability.can('read', 'Product')).toBe(true);
      expect(ability.can('update', 'Product')).toBe(true);
      expect(ability.can('delete', 'Product')).toBe(true);
    });

    it('can manage/create/read/update/delete ProductVariant', () => {
      const factory = new CaslAbilityFactory();
      const ability = factory.createForUser({
        id: 'user-1',
        role: Role.manager,
      });

      expect(ability.can('manage', 'ProductVariant')).toBe(true);
      expect(ability.can('create', 'ProductVariant')).toBe(true);
      expect(ability.can('read', 'ProductVariant')).toBe(true);
      expect(ability.can('update', 'ProductVariant')).toBe(true);
      expect(ability.can('delete', 'ProductVariant')).toBe(true);
    });

    it('can manage/create/read/update/delete ProductImage', () => {
      const factory = new CaslAbilityFactory();
      const ability = factory.createForUser({
        id: 'user-1',
        role: Role.manager,
      });

      expect(ability.can('manage', 'ProductImage')).toBe(true);
      expect(ability.can('create', 'ProductImage')).toBe(true);
      expect(ability.can('read', 'ProductImage')).toBe(true);
      expect(ability.can('update', 'ProductImage')).toBe(true);
      expect(ability.can('delete', 'ProductImage')).toBe(true);
    });

    it('can manage/create/read/update/delete VariantImage', () => {
      const factory = new CaslAbilityFactory();
      const ability = factory.createForUser({
        id: 'user-1',
        role: Role.manager,
      });

      expect(ability.can('manage', 'VariantImage')).toBe(true);
      expect(ability.can('create', 'VariantImage')).toBe(true);
      expect(ability.can('read', 'VariantImage')).toBe(true);
      expect(ability.can('update', 'VariantImage')).toBe(true);
      expect(ability.can('delete', 'VariantImage')).toBe(true);
    });

    it('can assign an Order', () => {
      const factory = new CaslAbilityFactory();
      const ability = factory.createForUser({
        id: 'user-1',
        role: Role.manager,
      });

      expect(ability.can('assign', 'Order')).toBe(true);
    });
  });

  describe('client', () => {
    it('can only read Product', () => {
      const factory = new CaslAbilityFactory();
      const ability = factory.createForUser({
        id: 'user-2',
        role: Role.client,
      });

      expect(ability.can('read', 'Product')).toBe(true);
      expect(ability.cannot('create', 'Product')).toBe(true);
      expect(ability.cannot('update', 'Product')).toBe(true);
      expect(ability.cannot('delete', 'Product')).toBe(true);
      expect(ability.cannot('manage', 'Product')).toBe(true);
    });

    it('can only read ProductVariant', () => {
      const factory = new CaslAbilityFactory();
      const ability = factory.createForUser({
        id: 'user-2',
        role: Role.client,
      });

      expect(ability.can('read', 'ProductVariant')).toBe(true);
      expect(ability.cannot('create', 'ProductVariant')).toBe(true);
      expect(ability.cannot('update', 'ProductVariant')).toBe(true);
      expect(ability.cannot('delete', 'ProductVariant')).toBe(true);
      expect(ability.cannot('manage', 'ProductVariant')).toBe(true);
    });

    it('gets no ability at all on ProductImage, not even read', () => {
      const factory = new CaslAbilityFactory();
      const ability = factory.createForUser({
        id: 'user-2',
        role: Role.client,
      });

      expect(ability.cannot('read', 'ProductImage')).toBe(true);
      expect(ability.cannot('create', 'ProductImage')).toBe(true);
      expect(ability.cannot('update', 'ProductImage')).toBe(true);
      expect(ability.cannot('delete', 'ProductImage')).toBe(true);
      expect(ability.cannot('manage', 'ProductImage')).toBe(true);
    });

    it('gets no ability at all on VariantImage, not even read', () => {
      const factory = new CaslAbilityFactory();
      const ability = factory.createForUser({
        id: 'user-2',
        role: Role.client,
      });

      expect(ability.cannot('read', 'VariantImage')).toBe(true);
      expect(ability.cannot('create', 'VariantImage')).toBe(true);
      expect(ability.cannot('update', 'VariantImage')).toBe(true);
      expect(ability.cannot('delete', 'VariantImage')).toBe(true);
      expect(ability.cannot('manage', 'VariantImage')).toBe(true);
    });

    it('cannot assign an Order', () => {
      const factory = new CaslAbilityFactory();
      const ability = factory.createForUser({
        id: 'user-2',
        role: Role.client,
      });

      expect(ability.cannot('assign', 'Order')).toBe(true);
    });
  });

  describe('deliveryPerson', () => {
    it('can read and update an Order', () => {
      const factory = new CaslAbilityFactory();
      const ability = factory.createForUser({
        id: 'user-4',
        role: Role.deliveryPerson,
      });

      expect(ability.can('read', 'Order')).toBe(true);
      expect(ability.can('update', 'Order')).toBe(true);
    });

    it('cannot assign, create, delete, cancel, or manage an Order', () => {
      const factory = new CaslAbilityFactory();
      const ability = factory.createForUser({
        id: 'user-4',
        role: Role.deliveryPerson,
      });

      expect(ability.cannot('assign', 'Order')).toBe(true);
      expect(ability.cannot('create', 'Order')).toBe(true);
      expect(ability.cannot('delete', 'Order')).toBe(true);
      expect(ability.cannot('cancel', 'Order')).toBe(true);
      expect(ability.cannot('manage', 'Order')).toBe(true);
    });

    it('has no abilities at all on any subject other than Order', () => {
      const factory = new CaslAbilityFactory();
      const ability = factory.createForUser({
        id: 'user-4',
        role: Role.deliveryPerson,
      });

      expect(ability.cannot('read', 'Product')).toBe(true);
      expect(ability.cannot('create', 'Product')).toBe(true);
      expect(ability.cannot('update', 'Product')).toBe(true);
      expect(ability.cannot('delete', 'Product')).toBe(true);
      expect(ability.cannot('manage', 'Product')).toBe(true);

      expect(ability.cannot('read', 'ProductVariant')).toBe(true);
      expect(ability.cannot('create', 'ProductVariant')).toBe(true);
      expect(ability.cannot('update', 'ProductVariant')).toBe(true);
      expect(ability.cannot('delete', 'ProductVariant')).toBe(true);
      expect(ability.cannot('manage', 'ProductVariant')).toBe(true);

      expect(ability.cannot('read', 'ProductImage')).toBe(true);
      expect(ability.cannot('create', 'ProductImage')).toBe(true);
      expect(ability.cannot('update', 'ProductImage')).toBe(true);
      expect(ability.cannot('delete', 'ProductImage')).toBe(true);
      expect(ability.cannot('manage', 'ProductImage')).toBe(true);

      expect(ability.cannot('read', 'VariantImage')).toBe(true);
      expect(ability.cannot('create', 'VariantImage')).toBe(true);
      expect(ability.cannot('update', 'VariantImage')).toBe(true);
      expect(ability.cannot('delete', 'VariantImage')).toBe(true);
      expect(ability.cannot('manage', 'VariantImage')).toBe(true);

      expect(ability.cannot('read', 'LikedProduct')).toBe(true);
      expect(ability.cannot('create', 'LikedProduct')).toBe(true);
      expect(ability.cannot('update', 'LikedProduct')).toBe(true);
      expect(ability.cannot('delete', 'LikedProduct')).toBe(true);
      expect(ability.cannot('manage', 'LikedProduct')).toBe(true);

      expect(ability.cannot('read', 'Cart')).toBe(true);
      expect(ability.cannot('create', 'Cart')).toBe(true);
      expect(ability.cannot('update', 'Cart')).toBe(true);
      expect(ability.cannot('delete', 'Cart')).toBe(true);
      expect(ability.cannot('manage', 'Cart')).toBe(true);
    });
  });

  it("gives an unrecognized role no abilities at all, not another role's abilities", () => {
    const factory = new CaslAbilityFactory();
    const ability = factory.createForUser({
      id: 'user-x',
      role: 'unknownRole' as Role,
    });

    expect(ability.cannot('read', 'Product')).toBe(true);
    expect(ability.cannot('read', 'Order')).toBe(true);
    expect(ability.cannot('manage', 'all')).toBe(true);
    expect(ability.rules).toHaveLength(0);
  });

  it('returns independent ability instances that do not leak permissions between users', () => {
    const factory = new CaslAbilityFactory();

    const managerAbility = factory.createForUser({
      id: 'manager-1',
      role: Role.manager,
    });
    const clientAbility = factory.createForUser({
      id: 'client-1',
      role: Role.client,
    });

    expect(managerAbility.can('delete', 'Product')).toBe(true);
    expect(clientAbility.cannot('delete', 'Product')).toBe(true);
    expect(clientAbility.cannot('create', 'ProductVariant')).toBe(true);

    // building the client ability after the manager one must not retroactively
    // change what the manager instance is allowed to do
    expect(managerAbility.can('delete', 'Product')).toBe(true);
    expect(managerAbility.can('create', 'ProductVariant')).toBe(true);
  });

  it('builds a real CASL Ability instance exposing can/cannot/rules', () => {
    const factory = new CaslAbilityFactory();
    const ability = factory.createForUser({ id: 'user-3', role: Role.client });

    expect(typeof ability.can).toBe('function');
    expect(typeof ability.cannot).toBe('function');
    expect(Array.isArray(ability.rules)).toBe(true);
  });
});
