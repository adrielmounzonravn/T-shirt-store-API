import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  createMailTransport,
  MailService,
  MAIL_TRANSPORT,
} from './mail.service.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: createMailTransport,
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
