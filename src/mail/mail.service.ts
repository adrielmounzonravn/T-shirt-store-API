import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { Transporter } from 'nodemailer';

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly from: string;

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transporter: Transporter,
    configService: ConfigService,
  ) {
    this.from = configService.getOrThrow<string>('mailer.from');
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: 'Verify your email',
        text: `Use this token to verify your email: ${token}`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to ${email}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }
}

export function createMailTransport(configService: ConfigService) {
  return createTransport({
    host: configService.getOrThrow<string>('mailer.host'),
    port: configService.getOrThrow<number>('mailer.port'),
    auth: {
      user: configService.get<string>('mailer.user'),
      pass: configService.get<string>('mailer.password'),
    },
  });
}
