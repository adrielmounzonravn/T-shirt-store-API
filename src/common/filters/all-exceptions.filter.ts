import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

interface ErrorResponseBody {
  statusCode: number;
  message: string;
  error: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toErrorResponse(exception);
    response.status(body.statusCode).json(body);
  }

  private toErrorResponse(exception: unknown): ErrorResponseBody {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.toErrorResponse(this.mapPrismaError(exception));
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : Array.isArray((payload as { message?: unknown }).message)
            ? (payload as { message: string[] }).message.join('; ')
            : ((payload as { message?: string }).message ?? exception.message);

      return {
        statusCode: status,
        message,
        error: HttpStatus[status] ?? exception.name,
      };
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    };
  }

  private mapPrismaError(
    error: Prisma.PrismaClientKnownRequestError,
  ): HttpException {
    switch (error.code) {
      case 'P2002': {
        const target = Array.isArray(error.meta?.target)
          ? error.meta.target.join(', ')
          : typeof error.meta?.target === 'string'
            ? error.meta.target
            : 'field';
        return new ConflictException(
          `A record with this ${target} already exists`,
        );
      }
      case 'P2025':
        return new NotFoundException('Record not found');
      default:
        this.logger.error(`Unmapped Prisma error ${error.code}`, error.stack);
        return new HttpException(
          'Database error',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
    }
  }
}
