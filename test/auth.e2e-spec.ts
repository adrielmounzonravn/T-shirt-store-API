import type { Server } from 'node:http';
import request from 'supertest';
import { MailService } from '../src/mail/mail.service.js';
import { Role } from '../src/generated/prisma/enums.js';
import {
  closeTestApp,
  createTestApp,
  resetDatabase,
  seedUser,
  type TestApp,
} from './e2e/test-app.js';

describe('Auth (e2e)', () => {
  let testApp: TestApp;
  let mailService: MailService;

  beforeAll(async () => {
    testApp = await createTestApp();
    mailService = testApp.app.get(MailService);
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const server = (): Server => testApp.app.getHttpServer() as Server;

  const accessTokenOf = (body: unknown): unknown =>
    (body as { accessToken: unknown }).accessToken;

  describe('POST /auth/signup', () => {
    it('creates an unverified client and never returns the password', async () => {
      const sendVerificationSpy = vi
        .spyOn(mailService, 'sendVerificationEmail')
        .mockResolvedValue();

      const response = await request(server())
        .post('/auth/signup')
        .send({
          email: 'new-user@example.com',
          password: 'Password123!',
          fullName: 'New User',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        email: 'new-user@example.com',
        fullName: 'New User',
        role: Role.client,
        isVerified: false,
        isActive: true,
      });
      const body = response.body as { password?: unknown; userId: unknown };
      expect(body.password).toBeUndefined();
      expect(body.userId).toEqual(expect.any(String));

      const dbUser = await testApp.prisma.user.findUniqueOrThrow({
        where: { email: 'new-user@example.com' },
      });
      expect(dbUser.isVerified).toBe(false);
      expect(dbUser.role).toBe(Role.client);

      expect(sendVerificationSpy).toHaveBeenCalledWith(
        'new-user@example.com',
        expect.any(String),
      );
    });

    it('returns 409 on duplicate email', async () => {
      vi.spyOn(mailService, 'sendVerificationEmail').mockResolvedValue();
      await seedUser(testApp.prisma, { email: 'dup@example.com' });

      await request(server())
        .post('/auth/signup')
        .send({
          email: 'dup@example.com',
          password: 'Password123!',
          fullName: 'Dup User',
        })
        .expect(409);
    });

    it('returns 400 for an invalid email format', async () => {
      await request(server())
        .post('/auth/signup')
        .send({
          email: 'not-an-email',
          password: 'Password123!',
          fullName: 'Bad Email',
        })
        .expect(400);
    });

    it('returns 400 when the password is too short', async () => {
      await request(server())
        .post('/auth/signup')
        .send({
          email: 'short-pass@example.com',
          password: 'short',
          fullName: 'Short Pass',
        })
        .expect(400);
    });

    it('returns 400 when fullName is missing', async () => {
      await request(server())
        .post('/auth/signup')
        .send({
          email: 'no-name@example.com',
          password: 'Password123!',
        })
        .expect(400);
    });

    it('returns 400 for an unknown/extra field', async () => {
      await request(server())
        .post('/auth/signup')
        .send({
          email: 'extra-field@example.com',
          password: 'Password123!',
          fullName: 'Extra Field',
          isAdmin: true,
        })
        .expect(400);
    });

    it('returns 400 for a smuggled role field and creates no user', async () => {
      await request(server())
        .post('/auth/signup')
        .send({
          email: 'role-smuggle@example.com',
          password: 'Password123!',
          fullName: 'Role Smuggle',
          role: 'manager',
        })
        .expect(400);

      const dbUser = await testApp.prisma.user.findUnique({
        where: { email: 'role-smuggle@example.com' },
      });
      expect(dbUser).toBeNull();
    });
  });

  describe('POST /auth/signin', () => {
    it('returns an accessToken for a verified user with correct credentials', async () => {
      await seedUser(testApp.prisma, {
        email: 'verified@example.com',
        password: 'Password123!',
        isVerified: true,
      });

      const response = await request(server())
        .post('/auth/signin')
        .send({ email: 'verified@example.com', password: 'Password123!' })
        .expect(200);

      expect(accessTokenOf(response.body)).toEqual(expect.any(String));
    });

    it('returns 401 for a wrong password', async () => {
      await seedUser(testApp.prisma, {
        email: 'verified2@example.com',
        password: 'Password123!',
        isVerified: true,
      });

      await request(server())
        .post('/auth/signin')
        .send({ email: 'verified2@example.com', password: 'WrongPass1!' })
        .expect(401);
    });

    it('returns 401 for a nonexistent email', async () => {
      await request(server())
        .post('/auth/signin')
        .send({ email: 'nobody@example.com', password: 'Password123!' })
        .expect(401);
    });

    it('returns 403 for correct credentials on an unverified account', async () => {
      await seedUser(testApp.prisma, {
        email: 'unverified@example.com',
        password: 'Password123!',
        isVerified: false,
      });

      await request(server())
        .post('/auth/signin')
        .send({ email: 'unverified@example.com', password: 'Password123!' })
        .expect(403);
    });
  });

  describe('POST /auth/verify-email', () => {
    it('verifies the email and allows sign-in afterward', async () => {
      const sendVerificationSpy = vi
        .spyOn(mailService, 'sendVerificationEmail')
        .mockResolvedValue();

      await request(server())
        .post('/auth/signup')
        .send({
          email: 'verify-flow@example.com',
          password: 'Password123!',
          fullName: 'Verify Flow',
        })
        .expect(201);

      const [, token] = sendVerificationSpy.mock.calls[0];

      await request(server())
        .post('/auth/verify-email')
        .send({ token })
        .expect(200);

      const dbUser = await testApp.prisma.user.findUniqueOrThrow({
        where: { email: 'verify-flow@example.com' },
      });
      expect(dbUser.isVerified).toBe(true);

      const signInResponse = await request(server())
        .post('/auth/signin')
        .send({ email: 'verify-flow@example.com', password: 'Password123!' })
        .expect(200);
      expect(accessTokenOf(signInResponse.body)).toEqual(expect.any(String));
    });

    it('returns 401 for an invalid token string', async () => {
      await request(server())
        .post('/auth/verify-email')
        .send({ token: 'not-a-real-jwt' })
        .expect(401);
    });

    it('returns 401 when reusing a token for an already-verified user', async () => {
      const sendVerificationSpy = vi
        .spyOn(mailService, 'sendVerificationEmail')
        .mockResolvedValue();

      await request(server())
        .post('/auth/signup')
        .send({
          email: 'reuse-token@example.com',
          password: 'Password123!',
          fullName: 'Reuse Token',
        })
        .expect(201);

      const [, token] = sendVerificationSpy.mock.calls[0];

      await request(server())
        .post('/auth/verify-email')
        .send({ token })
        .expect(200);

      await request(server())
        .post('/auth/verify-email')
        .send({ token })
        .expect(401);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('returns 202 and sends a reset email for an existing user', async () => {
      const sendResetSpy = vi
        .spyOn(mailService, 'sendPasswordResetEmail')
        .mockResolvedValue();
      await seedUser(testApp.prisma, { email: 'forgot@example.com' });

      await request(server())
        .post('/auth/forgot-password')
        .send({ email: 'forgot@example.com' })
        .expect(202);

      expect(sendResetSpy).toHaveBeenCalledWith(
        'forgot@example.com',
        expect.any(String),
      );
    });

    it('returns 202 for a nonexistent email without sending an email (anti-enumeration)', async () => {
      const sendResetSpy = vi
        .spyOn(mailService, 'sendPasswordResetEmail')
        .mockResolvedValue();

      await request(server())
        .post('/auth/forgot-password')
        .send({ email: 'ghost@example.com' })
        .expect(202);

      expect(sendResetSpy).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/reset-password', () => {
    async function requestResetToken(email: string): Promise<string> {
      const sendResetSpy = vi
        .spyOn(mailService, 'sendPasswordResetEmail')
        .mockResolvedValue();

      await request(server())
        .post('/auth/forgot-password')
        .send({ email })
        .expect(202);

      const [, token] = sendResetSpy.mock.calls[0];
      return token;
    }

    it('resets the password, notifies the user, and allows sign-in with the new password', async () => {
      const sendChangedSpy = vi
        .spyOn(mailService, 'sendPasswordChangedEmail')
        .mockResolvedValue();
      await seedUser(testApp.prisma, {
        email: 'reset-flow@example.com',
        password: 'OldPassword123!',
      });

      const token = await requestResetToken('reset-flow@example.com');

      await request(server())
        .post('/auth/reset-password')
        .send({ token, newPassword: 'NewPassword123!' })
        .expect(200);

      expect(sendChangedSpy).toHaveBeenCalledWith('reset-flow@example.com');

      await request(server())
        .post('/auth/signin')
        .send({
          email: 'reset-flow@example.com',
          password: 'NewPassword123!',
        })
        .expect(200);

      await request(server())
        .post('/auth/signin')
        .send({
          email: 'reset-flow@example.com',
          password: 'OldPassword123!',
        })
        .expect(401);
    });

    it('returns 401 when reusing the same reset token a second time', async () => {
      vi.spyOn(mailService, 'sendPasswordChangedEmail').mockResolvedValue();
      await seedUser(testApp.prisma, {
        email: 'reset-reuse@example.com',
        password: 'OldPassword123!',
      });

      const token = await requestResetToken('reset-reuse@example.com');

      await request(server())
        .post('/auth/reset-password')
        .send({ token, newPassword: 'NewPassword123!' })
        .expect(200);

      await request(server())
        .post('/auth/reset-password')
        .send({ token, newPassword: 'AnotherPassword123!' })
        .expect(401);
    });

    it('returns 401 for an invalid/garbage token', async () => {
      await request(server())
        .post('/auth/reset-password')
        .send({ token: 'garbage-token', newPassword: 'NewPassword123!' })
        .expect(401);
    });

    it('returns 400 when newPassword is too short', async () => {
      await seedUser(testApp.prisma, {
        email: 'short-new-pass@example.com',
        password: 'OldPassword123!',
      });
      const token = await requestResetToken('short-new-pass@example.com');

      await request(server())
        .post('/auth/reset-password')
        .send({ token, newPassword: 'short' })
        .expect(400);
    });
  });
});
