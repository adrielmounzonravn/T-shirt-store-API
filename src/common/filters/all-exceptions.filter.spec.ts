import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

interface ErrorResponseBody {
  statusCode: number;
  message: string;
  error: string;
}

function createMockHost() {
  const json = vi.fn<(body: ErrorResponseBody) => void>();
  const status = vi.fn<(code: number) => { json: typeof json }>(() => ({
    json,
  }));
  const response = { status };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  describe('when a Nest HttpException is thrown', () => {
    it('responds with the exception own status code and message for NotFoundException', () => {
      const { host, status, json } = createMockHost();

      filter.catch(new NotFoundException('Product not found'), host);

      expect(status).toHaveBeenCalledTimes(1);
      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledTimes(1);
      const body = json.mock.calls[0][0];
      expect(body.statusCode).toBe(404);
      expect(body.message).toContain('Product not found');
      expect(typeof body.error).toBe('string');
    });

    it('responds with 403 for ForbiddenException with no explicit message', () => {
      const { host, status, json } = createMockHost();

      filter.catch(new ForbiddenException(), host);

      expect(status).toHaveBeenCalledWith(403);
      const body = json.mock.calls[0][0];
      expect(body.statusCode).toBe(403);
      expect(typeof body.message).toBe('string');
      expect(body.message.length).toBeGreaterThan(0);
    });
  });

  describe('when a ValidationPipe-style BadRequestException is thrown', () => {
    it('flattens the array of validation messages into a single string message', () => {
      const { host, status, json } = createMockHost();
      const exception = new BadRequestException({
        statusCode: 400,
        message: [
          'email must be an email',
          'password must be longer than 8 characters',
        ],
        error: 'Bad Request',
      });

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(400);
      const body = json.mock.calls[0][0];
      expect(body.statusCode).toBe(400);
      expect(typeof body.message).toBe('string');
      expect(Array.isArray(body.message)).toBe(false);
      expect(body.message).toContain('email must be an email');
      expect(body.message).toContain(
        'password must be longer than 8 characters',
      );
    });
  });

  describe('when a Prisma unique-constraint violation (P2002) is thrown', () => {
    it('responds with 409 Conflict and a non-empty, non-raw message', () => {
      const { host, status, json } = createMockHost();
      const exception = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '7.10.0',
          meta: { target: ['email'] },
        },
      );

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(409);
      const body = json.mock.calls[0][0];
      expect(body.statusCode).toBe(409);
      expect(typeof body.message).toBe('string');
      expect(body.message.length).toBeGreaterThan(0);
      expect(body.error.toLowerCase()).toContain('conflict');
    });
  });

  describe('when a Prisma "record not found" error (P2025) is thrown', () => {
    it('responds with 404 Not Found', () => {
      const { host, status, json } = createMockHost();
      const exception = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found.',
        {
          code: 'P2025',
          clientVersion: '7.10.0',
        },
      );

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(404);
      const body = json.mock.calls[0][0];
      expect(body.statusCode).toBe(404);
      expect(typeof body.message).toBe('string');
      expect(body.message.length).toBeGreaterThan(0);
    });
  });

  describe('when a Prisma error with an unmapped code (P2003) is thrown', () => {
    it('responds with 500 and does not leak the raw Prisma error message', () => {
      const { host, status, json } = createMockHost();
      const rawMessage =
        'Foreign key constraint failed on the field: `productId`';
      const exception = new Prisma.PrismaClientKnownRequestError(rawMessage, {
        code: 'P2003',
        clientVersion: '7.10.0',
        meta: { field_name: 'productId' },
      });

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(500);
      const body = json.mock.calls[0][0];
      expect(body.statusCode).toBe(500);
      expect(typeof body.message).toBe('string');
      expect(body.message.length).toBeGreaterThan(0);
      expect(body.message).not.toBe(rawMessage);
      expect(body.message).not.toContain('productId');
      expect(body.message).not.toContain('constraint');
    });
  });

  describe('when a totally unrecognized error is thrown', () => {
    it('responds with 500 and never leaks the original Error message or stack', () => {
      const { host, status, json } = createMockHost();
      const secretMessage = 'boom, this has secret stack info';
      const exception = new Error(secretMessage);

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(500);
      const body = json.mock.calls[0][0];
      expect(body.statusCode).toBe(500);
      expect(typeof body.message).toBe('string');
      expect(body.message.length).toBeGreaterThan(0);
      expect(body.message).not.toContain(secretMessage);
      expect(JSON.stringify(body)).not.toContain(secretMessage);
      expect(typeof body.error).toBe('string');
      expect(body.error.length).toBeGreaterThan(0);
    });

    it('responds with 500 when a plain string is thrown', () => {
      const { host, status, json } = createMockHost();
      const secretMessage = 'raw thrown string, do not leak me';

      filter.catch(secretMessage, host);

      expect(status).toHaveBeenCalledWith(500);
      const body = json.mock.calls[0][0];
      expect(body.statusCode).toBe(500);
      expect(typeof body.message).toBe('string');
      expect(body.message).not.toContain(secretMessage);
    });

    it('responds with 500 when a plain object is thrown', () => {
      const { host, status, json } = createMockHost();
      const exception = { some: 'unexpected shape', secret: 'leak-me-not' };

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(500);
      const body = json.mock.calls[0][0];
      expect(body.statusCode).toBe(500);
      expect(typeof body.message).toBe('string');
      expect(JSON.stringify(body)).not.toContain('leak-me-not');
    });
  });

  describe('response invocation contract', () => {
    it('calls response.status and response.json exactly once, with matching status codes', () => {
      const { host, status, json } = createMockHost();

      filter.catch(new NotFoundException('Product not found'), host);

      expect(status).toHaveBeenCalledTimes(1);
      expect(json).toHaveBeenCalledTimes(1);
      const statusCodeArg = status.mock.calls[0][0];
      const body = json.mock.calls[0][0];
      expect(body.statusCode).toBe(statusCodeArg);
    });
  });
});
