import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDeliveryPersonDto } from './create-delivery-person.dto.js';

function validPayload(): Record<string, unknown> {
  return {
    email: 'delivery.person@example.com',
    password: 'password123',
    fullName: 'Jane Delivery',
    role: 'deliveryPerson',
  };
}

async function validatePayload(payload: Record<string, unknown>) {
  const instance = plainToInstance(CreateDeliveryPersonDto, payload);
  return validate(instance);
}

describe('CreateDeliveryPersonDto', () => {
  it('has no validation errors for a fully valid payload', async () => {
    const errors = await validatePayload(validPayload());

    expect(errors).toHaveLength(0);
  });

  it('fails validation when role is manager', async () => {
    const errors = await validatePayload({
      ...validPayload(),
      role: 'manager',
    });

    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });

  it('fails validation when role is client', async () => {
    const errors = await validatePayload({ ...validPayload(), role: 'client' });

    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });

  it('fails validation when role is missing', async () => {
    const payload = validPayload();
    delete payload.role;

    const errors = await validatePayload(payload);

    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });

  it('fails validation when email is not a valid email', async () => {
    const errors = await validatePayload({
      ...validPayload(),
      email: 'not-an-email',
    });

    expect(errors.some((error) => error.property === 'email')).toBe(true);
  });

  it('fails validation when password is shorter than 8 characters', async () => {
    const errors = await validatePayload({
      ...validPayload(),
      password: 'short1',
    });

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });

  it('fails validation when fullName is longer than 120 characters', async () => {
    const errors = await validatePayload({
      ...validPayload(),
      fullName: 'a'.repeat(121),
    });

    expect(errors.some((error) => error.property === 'fullName')).toBe(true);
  });
});
