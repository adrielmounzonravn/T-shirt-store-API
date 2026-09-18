import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AssignDeliveryPersonDto } from './assign-delivery-person.dto.js';

function validPayload(): Record<string, unknown> {
  return {
    deliveryPersonId: '22222222-2222-4222-8222-222222222222',
  };
}

async function validatePayload(payload: Record<string, unknown>) {
  const instance = plainToInstance(AssignDeliveryPersonDto, payload);
  return validate(instance);
}

describe('AssignDeliveryPersonDto', () => {
  it('has no validation errors for a fully valid payload', async () => {
    const errors = await validatePayload(validPayload());

    expect(errors).toHaveLength(0);
  });

  it('fails validation when deliveryPersonId is missing', async () => {
    const payload = validPayload();
    delete payload.deliveryPersonId;

    const errors = await validatePayload(payload);

    expect(errors.some((error) => error.property === 'deliveryPersonId')).toBe(
      true,
    );
  });

  it('fails validation when deliveryPersonId is not a valid UUID', async () => {
    const errors = await validatePayload({
      ...validPayload(),
      deliveryPersonId: 'not-a-uuid',
    });

    expect(errors.some((error) => error.property === 'deliveryPersonId')).toBe(
      true,
    );
  });
});
