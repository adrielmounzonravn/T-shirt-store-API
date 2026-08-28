import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { Role } from '../../generated/prisma/enums.js';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };

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
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('returns true when no roles metadata is present', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createContext({ sub: 'user-1', role: Role.client });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('returns true when the roles metadata is an empty array', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    const context = createContext({ sub: 'user-1', role: Role.client });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('returns true when the user role matches the required role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.manager]);
    const context = createContext({ sub: 'user-1', role: Role.manager });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('returns false when the user role does not match the required role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.manager]);
    const context = createContext({ sub: 'user-1', role: Role.client });

    expect(guard.canActivate(context)).toBe(false);
  });

  it('returns true when the user role matches one of several required roles', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.manager, Role.client]);
    const context = createContext({ sub: 'user-1', role: Role.client });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('checks metadata on both the handler and the class', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createContext({ sub: 'user-1', role: Role.client });

    guard.canActivate(context);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      'roles',
      expect.arrayContaining([expect.any(Function), expect.any(Function)]),
    );
  });
});
