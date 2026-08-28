import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseEntity } from '../entities/error-response.entity.js';

const RESPONSE_DECORATORS = {
  400: () =>
    ApiBadRequestResponse({
      description: 'Invalid input',
      type: ErrorResponseEntity,
    }),
  401: () =>
    ApiUnauthorizedResponse({
      description: 'Missing or invalid credentials',
      type: ErrorResponseEntity,
    }),
  403: () =>
    ApiForbiddenResponse({
      description:
        'Authenticated but not allowed to perform this action (CASL)',
      type: ErrorResponseEntity,
    }),
  404: () =>
    ApiNotFoundResponse({
      description: 'Resource not found',
      type: ErrorResponseEntity,
    }),
  409: () =>
    ApiConflictResponse({
      description: 'Conflicting state (e.g. duplicate email)',
      type: ErrorResponseEntity,
    }),
  429: () =>
    ApiTooManyRequestsResponse({
      description: 'Rate limit exceeded',
      type: ErrorResponseEntity,
    }),
} as const satisfies Record<number, () => MethodDecorator & ClassDecorator>;

type ApiErrorStatus = keyof typeof RESPONSE_DECORATORS;

export function ApiErrorResponses(
  ...statuses: ApiErrorStatus[]
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...statuses.map((status) => RESPONSE_DECORATORS[status]()),
  );
}
