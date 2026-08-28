import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  Controller,
  Get,
  UseGuards,
  type INestApplication,
} from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { Roles } from './decorators/roles.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import type { JwtPayload } from './jwt-payload.interface.js';
import { Role } from '../generated/prisma/enums.js';
import { PoliciesGuard } from '../casl/guards/policies.guard.js';
import { CheckPolicies } from '../casl/decorators/check-policies.decorator.js';
import { CaslAbilityFactory } from '../casl/casl-ability.factory.js';

const JWT_SECRET = 'test-secret';

@Controller('test')
class TestController {
  @Get('protected')
  @UseGuards(JwtAuthGuard, RolesGuard, PoliciesGuard)
  @Roles(Role.manager)
  @CheckPolicies((ability) => ability.can('manage', 'Product'))
  protectedRoute(@CurrentUser() user: JwtPayload) {
    return user;
  }

  @Get('client-and-manager-but-manage-only')
  @UseGuards(JwtAuthGuard, RolesGuard, PoliciesGuard)
  @Roles(Role.client, Role.manager)
  @CheckPolicies((ability) => ability.can('manage', 'Product'))
  clientPassesRolesButNotPolicies() {
    return { ok: true };
  }

  @Get('no-jwt-guard')
  @UseGuards(RolesGuard)
  @Roles(Role.manager)
  noJwtGuard(@CurrentUser() user: JwtPayload) {
    return user;
  }
}

describe('Authorization guard chain (JwtAuthGuard -> RolesGuard -> PoliciesGuard)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const configService = {
      getOrThrow: vi.fn().mockReturnValue(JWT_SECRET),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [TestController],
      providers: [
        JwtStrategy,
        JwtService,
        RolesGuard,
        PoliciesGuard,
        CaslAbilityFactory,
        ConfigService,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(configService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  const signToken = (payload: JwtPayload) =>
    jwtService.sign(payload, { secret: JWT_SECRET });

  it('returns 401 when no Authorization header is provided', async () => {
    await request(app.getHttpServer()).get('/test/protected').expect(401);
  });

  it('returns 403 for an authenticated client (blocked by RolesGuard)', async () => {
    const token = signToken({ sub: 'user-1', role: Role.client });

    await request(app.getHttpServer())
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 200 and the CurrentUser payload for an authenticated manager', async () => {
    const payload: JwtPayload = { sub: 'user-2', role: Role.manager };
    const token = signToken(payload);

    const response = await request(app.getHttpServer())
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject(payload);
  });

  it('returns 403 when RolesGuard passes but PoliciesGuard denies', async () => {
    const token = signToken({ sub: 'user-3', role: Role.client });

    await request(app.getHttpServer())
      .get('/test/client-and-manager-but-manage-only')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('throws instead of returning a clean 403 when JwtAuthGuard is skipped and request.user is unset', async () => {
    await request(app.getHttpServer()).get('/test/no-jwt-guard').expect(500);
  });
});
