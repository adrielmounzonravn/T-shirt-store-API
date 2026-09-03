import { readFileSync } from 'node:fs';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const caCertPath = configService.get<string>('databaseCaCertPath');

    super({
      adapter: new PrismaPg({
        connectionString: configService.get<string>('databaseUrl'),
        ...(caCertPath && {
          ssl: { ca: readFileSync(caCertPath, 'utf8') },
        }),
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
