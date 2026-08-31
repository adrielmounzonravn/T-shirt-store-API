import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { Role } from '../../src/generated/prisma/enums.js';
import type { User } from '../../src/generated/prisma/client.js';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
}

// Builds the Nest app the same way `src/main.ts` does for every e2e suite:
// same global ValidationPipe options, same rawBody flag (needed for the
// Stripe webhook signature check in Phase 4). The exception filter,
// serialization interceptor and throttler guard don't need to be re-applied
// here — `AppModule` already registers them as `APP_FILTER`/`APP_INTERCEPTOR`/
// `APP_GUARD` providers, so `Test.createTestingModule({ imports: [AppModule] })`
// picks them up automatically.
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

export async function closeTestApp({ app }: TestApp): Promise<void> {
  await app.close();
}

// Truncates every table except Prisma's own migrations table, so each e2e
// suite starts from an empty database without needing a fresh container.
// Not safe to run concurrently against the same database — pair with
// `fileParallelism: false` in vitest.config.e2e.ts.
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const tableList = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`,
  );
}

export interface SeedUserOptions {
  email?: string;
  password?: string;
  fullName?: string;
  role?: Role;
  isVerified?: boolean;
  isActive?: boolean;
}

// Inserts a user directly through Prisma, bypassing the sign-up endpoint
// (which always creates an unverified `client`). Suites that need an
// already-verified client or a manager — neither reachable through the
// public API — get one without duplicating the hashing/insert logic.
export async function seedUser(
  prisma: PrismaService,
  options: SeedUserOptions = {},
): Promise<User> {
  const password = options.password ?? 'Password123!';
  const passwordHash = await bcrypt.hash(password, 10);

  return prisma.user.create({
    data: {
      email: options.email ?? `${randomUUID()}@example.com`,
      password: passwordHash,
      fullName: options.fullName ?? 'Test User',
      role: options.role ?? Role.client,
      isVerified: options.isVerified ?? true,
      isActive: options.isActive ?? true,
    },
  });
}

// Signs a JWT for `user` the same way `AuthService.signIn` does, so a suite
// that only needs an authenticated request doesn't have to drive the real
// sign-in endpoint every time.
export function signAccessToken(app: INestApplication, user: User): string {
  const jwtService = app.get(JwtService);
  return jwtService.sign({ sub: user.id, role: user.role });
}
