import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { S3_CLIENT } from './s3-client.provider.js';

const EXTENSION_BY_MIMETYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class StorageService {
  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    private readonly config: ConfigService,
  ) {}

  buildObjectKey(
    prefix: 'products' | 'variants',
    parentId: string,
    imageId: string,
    mimetype: string,
  ): string {
    const extension = EXTENSION_BY_MIMETYPE[mimetype] ?? 'bin';

    return `${prefix}/${parentId}/${imageId}.${extension}`;
  }

  async upload(key: string, file: Express.Multer.File): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.get<string>('s3.bucket'),
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.config.get<string>('s3.bucket'),
        Key: key,
      }),
    );
  }
}
