import { BadRequestException } from '@nestjs/common';
import type { MulterModuleOptions } from '@nestjs/platform-express';

const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export const imageUploadOptions: MulterModuleOptions = {
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req: unknown, file: Express.Multer.File, callback) => {
    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      callback(
        new BadRequestException(
          `Unsupported file type: ${file.mimetype}. Allowed types: ${ALLOWED_MIMETYPES.join(', ')}`,
        ),
        false,
      );
      return;
    }

    callback(null, true);
  },
};
