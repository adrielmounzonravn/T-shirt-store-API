import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { MailService } from '../mail/mail.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { Role } from '../generated/prisma/enums.js';

vi.mock('bcrypt', () => {
  const compare = vi.fn();
  const hash = vi.fn();
  return {
    default: { compare, hash },
    compare,
    hash,
  };
});

import * as bcrypt from 'bcrypt';

const compareMock = bcrypt.compare as ReturnType<typeof vi.fn>;

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    create: ReturnType<typeof vi.fn>;
    findByEmail: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    markVerified: ReturnType<typeof vi.fn>;
    createPasswordResetToken: ReturnType<typeof vi.fn>;
    findValidPasswordResetToken: ReturnType<typeof vi.fn>;
    consumePasswordResetToken: ReturnType<typeof vi.fn>;
    updatePassword: ReturnType<typeof vi.fn>;
  };
  let jwtService: {
    sign: ReturnType<typeof vi.fn>;
    verify: ReturnType<typeof vi.fn>;
  };
  let mailService: {
    sendVerificationEmail: ReturnType<typeof vi.fn>;
    sendPasswordResetEmail: ReturnType<typeof vi.fn>;
    sendPasswordChangedEmail: ReturnType<typeof vi.fn>;
  };
  let configService: { getOrThrow: ReturnType<typeof vi.fn> };

  const userRow = new UserEntity({
    id: 'user-1',
    email: 'jane@example.com',
    password: 'hashed-password-value',
    fullName: 'Jane Doe',
    role: Role.client,
    isActive: true,
    isVerified: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  });

  beforeEach(async () => {
    usersService = {
      create: vi.fn(),
      findByEmail: vi.fn(),
      findById: vi.fn(),
      markVerified: vi.fn(),
      createPasswordResetToken: vi.fn(),
      findValidPasswordResetToken: vi.fn(),
      consumePasswordResetToken: vi.fn(),
      updatePassword: vi.fn(),
    };
    jwtService = {
      sign: vi.fn(),
      verify: vi.fn(),
    };
    mailService = {
      sendVerificationEmail: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
      sendPasswordChangedEmail: vi.fn(),
    };
    configService = {
      getOrThrow: vi.fn(),
    };
    configService.getOrThrow.mockReturnValue(24);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        UsersService,
        JwtService,
        MailService,
        ConfigService,
      ],
    })
      .overrideProvider(UsersService)
      .useValue(usersService)
      .overrideProvider(JwtService)
      .useValue(jwtService)
      .overrideProvider(MailService)
      .useValue(mailService)
      .overrideProvider(ConfigService)
      .useValue(configService)
      .compile();

    service = moduleRef.get(AuthService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('signUp', () => {
    const input = {
      email: 'jane@example.com',
      password: 'plaintext-password',
      fullName: 'Jane Doe',
    };

    it('delegates to usersService.create with the exact input', async () => {
      usersService.create.mockResolvedValue(userRow);

      await service.signUp(input);

      expect(usersService.create).toHaveBeenCalledWith(input);
      expect(usersService.create).toHaveBeenCalledTimes(1);
    });

    it('resolves to whatever usersService.create resolves to', async () => {
      usersService.create.mockResolvedValue(userRow);

      const result = await service.signUp(input);

      expect(result).toBe(userRow);
    });

    it('propagates the error when usersService.create rejects', async () => {
      const error = new Error(
        'Unique constraint failed on the fields: (`email`)',
      );
      usersService.create.mockRejectedValue(error);

      await expect(service.signUp(input)).rejects.toThrow(error);
    });

    it('signs an email-verification JWT for the newly created user', async () => {
      usersService.create.mockResolvedValue(userRow);
      jwtService.sign.mockReturnValue('signed-verification-token');

      await service.signUp(input);

      expect(configService.getOrThrow).toHaveBeenCalledWith(
        'auth.emailVerificationTokenTtlHours',
      );
      expect(jwtService.sign).toHaveBeenCalledTimes(1);
      const [payload, options] = jwtService.sign.mock.calls[0] as [
        Record<string, unknown>,
        { expiresIn: number },
      ];
      expect(payload).toEqual({
        sub: userRow.id,
        purpose: 'email-verification',
      });
      expect(typeof options.expiresIn).toBe('number');
    });

    it('sends a verification email to the new user with the signed token', async () => {
      usersService.create.mockResolvedValue(userRow);
      jwtService.sign.mockReturnValue('signed-verification-token');

      await service.signUp(input);

      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
        userRow.email,
        'signed-verification-token',
      );
      expect(mailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
    });

    it('still resolves to the created UserEntity despite the extra side effects', async () => {
      usersService.create.mockResolvedValue(userRow);
      jwtService.sign.mockReturnValue('signed-verification-token');

      const result = await service.signUp(input);

      expect(result).toBe(userRow);
    });
  });

  describe('validateUser', () => {
    it('resolves to null and never calls bcrypt.compare when no user is found', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.validateUser(
        'missing@example.com',
        'any-password',
      );

      expect(result).toBeNull();
      expect(compareMock).not.toHaveBeenCalled();
    });

    it('resolves to the UserEntity when the password matches', async () => {
      usersService.findByEmail.mockResolvedValue(userRow);
      compareMock.mockResolvedValue(true);

      const result = await service.validateUser(
        'jane@example.com',
        'plaintext-password',
      );

      expect(usersService.findByEmail).toHaveBeenCalledWith('jane@example.com');
      expect(compareMock).toHaveBeenCalledWith(
        'plaintext-password',
        userRow.password,
      );
      expect(result).toEqual(userRow);
    });

    it('resolves to null when the password does not match', async () => {
      usersService.findByEmail.mockResolvedValue(userRow);
      compareMock.mockResolvedValue(false);

      const result = await service.validateUser(
        'jane@example.com',
        'wrong-password',
      );

      expect(compareMock).toHaveBeenCalledWith(
        'wrong-password',
        userRow.password,
      );
      expect(result).toBeNull();
    });
  });

  describe('signIn', () => {
    it('resolves to an accessToken produced by jwtService.sign for a verified user', () => {
      jwtService.sign.mockReturnValue('signed-jwt-token');

      const result = service.signIn(userRow);

      expect(result).toEqual({ accessToken: 'signed-jwt-token' });
    });

    it('signs a payload containing exactly sub and role, nothing else', () => {
      jwtService.sign.mockReturnValue('signed-jwt-token');

      service.signIn(userRow);

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: userRow.id,
        role: userRow.role,
      });
      expect(jwtService.sign).toHaveBeenCalledTimes(1);
    });

    it('throws ForbiddenException and never signs a token for an unverified user', () => {
      const unverifiedUser = new UserEntity({
        ...userRow,
        isVerified: false,
      });

      expect(() => service.signIn(unverifiedUser)).toThrow(ForbiddenException);
      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('throws UnauthorizedException and never looks up the user when jwtService.verify throws', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.verifyEmail('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException and never looks up the user when the payload purpose is wrong', async () => {
      jwtService.verify.mockReturnValue({
        sub: userRow.id,
        purpose: 'password-reset',
      });

      await expect(service.verifyEmail('wrong-purpose-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException and never marks verified when no user is found', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'missing-user',
        purpose: 'email-verification',
      });
      usersService.findById.mockResolvedValue(null);

      await expect(service.verifyEmail('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(usersService.findById).toHaveBeenCalledWith('missing-user');
      expect(usersService.markVerified).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException and never marks verified when the user is already verified', async () => {
      jwtService.verify.mockReturnValue({
        sub: userRow.id,
        purpose: 'email-verification',
      });
      usersService.findById.mockResolvedValue(userRow);

      await expect(service.verifyEmail('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(usersService.markVerified).not.toHaveBeenCalled();
    });

    it('marks the user verified when the token is valid and the user is not yet verified', async () => {
      const unverifiedUser = new UserEntity({
        ...userRow,
        isVerified: false,
      });
      jwtService.verify.mockReturnValue({
        sub: unverifiedUser.id,
        purpose: 'email-verification',
      });
      usersService.findById.mockResolvedValue(unverifiedUser);
      usersService.markVerified.mockResolvedValue(
        new UserEntity({ ...unverifiedUser, isVerified: true }),
      );

      await expect(service.verifyEmail('valid-token')).resolves.toBeUndefined();

      expect(usersService.markVerified).toHaveBeenCalledWith(unverifiedUser.id);
      expect(usersService.markVerified).toHaveBeenCalledTimes(1);
    });
  });

  describe('forgotPassword', () => {
    it('does nothing and resolves to undefined when no user is found', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.forgotPassword('missing@example.com'),
      ).resolves.toBeUndefined();

      expect(usersService.findByEmail).toHaveBeenCalledWith(
        'missing@example.com',
      );
      expect(usersService.createPasswordResetToken).not.toHaveBeenCalled();
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('creates a hashed password-reset token with an expiry based on the configured TTL', async () => {
      usersService.findByEmail.mockResolvedValue(userRow);
      configService.getOrThrow.mockReturnValue(2);

      const before = new Date();
      await service.forgotPassword('jane@example.com');

      expect(configService.getOrThrow).toHaveBeenCalledWith(
        'auth.resetTokenTtlHours',
      );
      expect(usersService.createPasswordResetToken).toHaveBeenCalledTimes(1);
      const [userId, hashedToken, expiresAt] = usersService
        .createPasswordResetToken.mock.calls[0] as [string, string, Date];
      expect(userId).toBe(userRow.id);
      expect(typeof hashedToken).toBe('string');
      expect(hashedToken.length).toBeGreaterThan(0);
      expect(expiresAt).toBeInstanceOf(Date);
      expect(expiresAt.getTime()).toBeGreaterThan(before.getTime());
    });

    it('sends the raw token to the mail service, distinct from the hashed value that was persisted', async () => {
      usersService.findByEmail.mockResolvedValue(userRow);

      await service.forgotPassword('jane@example.com');

      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      const [emailArg, rawTokenArg] = mailService.sendPasswordResetEmail.mock
        .calls[0] as [string, string];
      expect(emailArg).toBe(userRow.email);
      expect(typeof rawTokenArg).toBe('string');
      expect(rawTokenArg.length).toBeGreaterThan(0);

      const [, hashedToken] = usersService.createPasswordResetToken.mock
        .calls[0] as [string, string, Date];
      expect(rawTokenArg).not.toBe(hashedToken);
    });

    it('resolves to undefined when a user is found', async () => {
      usersService.findByEmail.mockResolvedValue(userRow);

      await expect(
        service.forgotPassword('jane@example.com'),
      ).resolves.toBeUndefined();
    });

    it('generates a fresh random raw token on every call, not a fixed or reused value', async () => {
      usersService.findByEmail.mockResolvedValue(userRow);

      await service.forgotPassword('jane@example.com');
      await service.forgotPassword('jane@example.com');

      const [, firstRawToken] = mailService.sendPasswordResetEmail.mock
        .calls[0] as [string, string];
      const [, secondRawToken] = mailService.sendPasswordResetEmail.mock
        .calls[1] as [string, string];

      expect(firstRawToken).not.toBe(secondRawToken);
    });
  });

  describe('resetPassword', () => {
    it('looks up the token via findValidPasswordResetToken with a single string argument', async () => {
      usersService.findValidPasswordResetToken.mockResolvedValue({
        id: 'reset-1',
        userId: userRow.id,
      });
      usersService.findById.mockResolvedValue(userRow);

      await service.resetPassword('raw-token', 'new-plaintext-password');

      expect(usersService.findValidPasswordResetToken).toHaveBeenCalledTimes(1);
      const [hashArg] = usersService.findValidPasswordResetToken.mock
        .calls[0] as [string];
      expect(typeof hashArg).toBe('string');
    });

    it('throws UnauthorizedException and does nothing else when no valid token row is found', async () => {
      usersService.findValidPasswordResetToken.mockResolvedValue(null);

      await expect(
        service.resetPassword('bad-token', 'new-plaintext-password'),
      ).rejects.toThrow(UnauthorizedException);

      expect(usersService.updatePassword).not.toHaveBeenCalled();
      expect(usersService.consumePasswordResetToken).not.toHaveBeenCalled();
      expect(mailService.sendPasswordChangedEmail).not.toHaveBeenCalled();
    });

    it('updates the password with the row userId and the given plaintext password', async () => {
      usersService.findValidPasswordResetToken.mockResolvedValue({
        id: 'reset-1',
        userId: userRow.id,
      });
      usersService.findById.mockResolvedValue(userRow);

      await service.resetPassword('raw-token', 'new-plaintext-password');

      expect(usersService.updatePassword).toHaveBeenCalledWith(
        userRow.id,
        'new-plaintext-password',
      );
      expect(usersService.updatePassword).toHaveBeenCalledTimes(1);
    });

    it('consumes the reset token row by its id', async () => {
      usersService.findValidPasswordResetToken.mockResolvedValue({
        id: 'reset-1',
        userId: userRow.id,
      });
      usersService.findById.mockResolvedValue(userRow);

      await service.resetPassword('raw-token', 'new-plaintext-password');

      expect(usersService.consumePasswordResetToken).toHaveBeenCalledWith(
        'reset-1',
      );
      expect(usersService.consumePasswordResetToken).toHaveBeenCalledTimes(1);
    });

    it('sends a password-changed notification to the user found by userId', async () => {
      usersService.findValidPasswordResetToken.mockResolvedValue({
        id: 'reset-1',
        userId: userRow.id,
      });
      usersService.findById.mockResolvedValue(userRow);

      await service.resetPassword('raw-token', 'new-plaintext-password');

      expect(usersService.findById).toHaveBeenCalledWith(userRow.id);
      expect(mailService.sendPasswordChangedEmail).toHaveBeenCalledWith(
        userRow.email,
      );
      expect(mailService.sendPasswordChangedEmail).toHaveBeenCalledTimes(1);
    });

    it('does not throw and does not send a notification when the user is no longer found', async () => {
      usersService.findValidPasswordResetToken.mockResolvedValue({
        id: 'reset-1',
        userId: userRow.id,
      });
      usersService.findById.mockResolvedValue(null);

      await expect(
        service.resetPassword('raw-token', 'new-plaintext-password'),
      ).resolves.toBeUndefined();

      expect(mailService.sendPasswordChangedEmail).not.toHaveBeenCalled();
    });

    it('resolves to undefined on a successful reset', async () => {
      usersService.findValidPasswordResetToken.mockResolvedValue({
        id: 'reset-1',
        userId: userRow.id,
      });
      usersService.findById.mockResolvedValue(userRow);

      await expect(
        service.resetPassword('raw-token', 'new-plaintext-password'),
      ).resolves.toBeUndefined();
    });
  });
});
