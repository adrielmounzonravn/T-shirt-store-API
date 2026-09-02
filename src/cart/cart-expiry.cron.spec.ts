import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { CartExpiryCron } from './cart-expiry.cron.js';
import { CartService } from './cart.service.js';

describe('CartExpiryCron', () => {
  let cron: CartExpiryCron;
  let cartService: {
    expireStaleCarts: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    cartService = {
      expireStaleCarts: vi.fn().mockResolvedValue(0),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [CartExpiryCron, CartService],
    })
      .overrideProvider(CartService)
      .useValue(cartService)
      .compile();

    cron = moduleRef.get(CartExpiryCron);
  });

  describe('sweep', () => {
    it('calls expireStaleCarts exactly once', async () => {
      await cron.sweep();

      expect(cartService.expireStaleCarts).toHaveBeenCalledTimes(1);
    });

    it('resolves without throwing when expireStaleCarts succeeds', async () => {
      cartService.expireStaleCarts.mockResolvedValue(3);

      await expect(cron.sweep()).resolves.toBeUndefined();
    });

    it('resolves without throwing when expireStaleCarts rejects', async () => {
      cartService.expireStaleCarts.mockRejectedValue(
        new Error('database unreachable'),
      );

      await expect(cron.sweep()).resolves.toBeUndefined();
    });
  });
});
