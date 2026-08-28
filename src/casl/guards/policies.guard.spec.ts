import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PoliciesGuard } from './policies.guard.js';
import { CaslAbilityFactory } from '../casl-ability.factory.js';
import { CHECK_POLICIES_KEY } from '../decorators/check-policies.decorator.js';
import type { PolicyHandlerCallback } from '../decorators/check-policies.decorator.js';
import { Role } from '../../generated/prisma/enums.js';

describe('PoliciesGuard', () => {
  let guard: PoliciesGuard;
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };
  let caslAbilityFactory: { createForUser: ReturnType<typeof vi.fn> };
  const fakeAbility = { fake: true };

  const createContext = (user?: { sub: string; role: Role }) => {
    const handler = () => undefined;
    class TestClass {}

    return {
      getHandler: () => handler,
      getClass: () => TestClass,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: vi.fn() };
    caslAbilityFactory = {
      createForUser: vi.fn().mockReturnValue(fakeAbility),
    };
    guard = new PoliciesGuard(
      reflector as unknown as Reflector,
      caslAbilityFactory as unknown as CaslAbilityFactory,
    );
  });

  it('returns true when no policy handlers metadata is present', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createContext({ sub: 'user-1', role: Role.client });

    expect(guard.canActivate(context)).toBe(true);
    expect(caslAbilityFactory.createForUser).not.toHaveBeenCalled();
  });

  it('returns true when the policy handlers metadata is an empty array', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    const context = createContext({ sub: 'user-1', role: Role.client });

    expect(guard.canActivate(context)).toBe(true);
    expect(caslAbilityFactory.createForUser).not.toHaveBeenCalled();
  });

  it('returns true when a single attached handler passes', () => {
    const handler: PolicyHandlerCallback = vi.fn().mockReturnValue(true);
    reflector.getAllAndOverride.mockReturnValue([handler]);
    const context = createContext({ sub: 'user-1', role: Role.client });

    expect(guard.canActivate(context)).toBe(true);
    expect(handler).toHaveBeenCalledWith(fakeAbility);
  });

  it('returns false when a single attached handler fails', () => {
    const handler: PolicyHandlerCallback = vi.fn().mockReturnValue(false);
    reflector.getAllAndOverride.mockReturnValue([handler]);
    const context = createContext({ sub: 'user-1', role: Role.client });

    expect(guard.canActivate(context)).toBe(false);
  });

  it('returns false when multiple handlers are attached and one fails', () => {
    const passingHandler: PolicyHandlerCallback = vi.fn().mockReturnValue(true);
    const failingHandler: PolicyHandlerCallback = vi
      .fn()
      .mockReturnValue(false);
    reflector.getAllAndOverride.mockReturnValue([
      passingHandler,
      failingHandler,
    ]);
    const context = createContext({ sub: 'user-1', role: Role.client });

    expect(guard.canActivate(context)).toBe(false);
  });

  it('returns true only when every attached handler passes', () => {
    const first: PolicyHandlerCallback = vi.fn().mockReturnValue(true);
    const second: PolicyHandlerCallback = vi.fn().mockReturnValue(true);
    reflector.getAllAndOverride.mockReturnValue([first, second]);
    const context = createContext({ sub: 'user-1', role: Role.client });

    expect(guard.canActivate(context)).toBe(true);
    expect(first).toHaveBeenCalledWith(fakeAbility);
    expect(second).toHaveBeenCalledWith(fakeAbility);
  });

  it('builds the ability from the mapped user (sub -> id) rather than the raw JWT payload', () => {
    const handler: PolicyHandlerCallback = vi.fn().mockReturnValue(true);
    reflector.getAllAndOverride.mockReturnValue([handler]);
    const context = createContext({ sub: 'user-42', role: Role.manager });

    guard.canActivate(context);

    expect(caslAbilityFactory.createForUser).toHaveBeenCalledWith({
      id: 'user-42',
      role: Role.manager,
    });
    expect(caslAbilityFactory.createForUser).not.toHaveBeenCalledWith(
      expect.objectContaining({ sub: expect.anything() as unknown }),
    );
  });

  it('checks metadata on both the handler and the class', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createContext({ sub: 'user-1', role: Role.client });

    guard.canActivate(context);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      CHECK_POLICIES_KEY,
      expect.arrayContaining([expect.any(Function), expect.any(Function)]),
    );
  });
});
