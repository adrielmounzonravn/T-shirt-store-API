import { Injectable } from '@nestjs/common';

const EXTENSION_BY_MIMETYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class StorageService {
  buildObjectKey(
    prefix: 'products' | 'variants',
    parentId: string,
    imageId: string,
    originalFilename: string,
    mimetype: string,
  ): string {
    const extension =
      this.extractExtension(originalFilename) ??
      EXTENSION_BY_MIMETYPE[mimetype] ??
      'bin';

    return `${prefix}/${parentId}/${imageId}.${extension}`;
  }

  upload(key: string, file: Express.Multer.File): Promise<void> {
    void key;
    void file;
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    void key;
    return Promise.resolve();
  }

  private extractExtension(filename: string): string | undefined {
    const lastDot = filename.lastIndexOf('.');

    if (lastDot === -1 || lastDot === filename.length - 1) {
      return undefined;
    }

    return filename.slice(lastDot + 1).toLowerCase();
  }
}
