import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database connection failed');
    }

    return { status: 'ok' };
  }
}
