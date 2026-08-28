import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService, MAIL_TRANSPORT } from './mail.service.js';

describe('MailService', () => {
  let service: MailService;
  let transporter: { sendMail: ReturnType<typeof vi.fn> };
  let configService: { getOrThrow: ReturnType<typeof vi.fn> };

  const FROM_ADDRESS = 'no-reply@tshirtstore.example.com';

  beforeEach(async () => {
    transporter = {
      sendMail: vi.fn(),
    };
    configService = {
      getOrThrow: vi.fn().mockReturnValue(FROM_ADDRESS),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: MAIL_TRANSPORT, useValue: transporter },
        ConfigService,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(configService)
      .compile();

    service = moduleRef.get(MailService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('sendVerificationEmail', () => {
    it('reads the from address from config', () => {
      expect(configService.getOrThrow).toHaveBeenCalledWith('mailer.from');
    });

    it('sends the email to the given address from the configured from address', async () => {
      transporter.sendMail.mockResolvedValue(undefined);

      await service.sendVerificationEmail('jane@example.com', 'verify-token');

      expect(transporter.sendMail).toHaveBeenCalledTimes(1);
      const [options] = transporter.sendMail.mock.calls[0] as [
        { to: string; from: string },
      ];
      expect(options.to).toBe('jane@example.com');
      expect(options.from).toBe(FROM_ADDRESS);
    });

    it('includes the raw token in the email body', async () => {
      transporter.sendMail.mockResolvedValue(undefined);

      await service.sendVerificationEmail('jane@example.com', 'verify-token');

      const [options] = transporter.sendMail.mock.calls[0] as [
        { text?: string; html?: string },
      ];
      const body = `${options.text ?? ''}${options.html ?? ''}`;
      expect(body).toContain('verify-token');
    });

    it('resolves without throwing when transporter.sendMail rejects', async () => {
      transporter.sendMail.mockRejectedValue(new Error('SMTP unavailable'));

      await expect(
        service.sendVerificationEmail('jane@example.com', 'verify-token'),
      ).resolves.toBeUndefined();
    });
  });
});
