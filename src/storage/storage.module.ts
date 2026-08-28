import { Module } from '@nestjs/common';
import { StorageService } from './storage.service.js';
import { s3ClientProvider } from './s3-client.provider.js';

@Module({
  providers: [StorageService, s3ClientProvider],
  exports: [StorageService],
})
export class StorageModule {}
