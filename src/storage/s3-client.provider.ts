import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import type { Provider } from '@nestjs/common';

export const S3_CLIENT = 'S3_CLIENT';

export const s3ClientProvider: Provider = {
  provide: S3_CLIENT,
  useFactory: (config: ConfigService): S3Client => {
    const accessKeyId = config.get<string>('s3.accessKeyId');
    const secretAccessKey = config.get<string>('s3.secretAccessKey');

    return new S3Client({
      region: config.get<string>('s3.region'),
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  },
  inject: [ConfigService],
};
