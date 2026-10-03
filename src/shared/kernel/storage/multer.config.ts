// `MulterOptions` isn't re-exported from the package root (only from this
// internal path) — `FileInterceptor`/`FilesInterceptor` themselves import it
// the same way.
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';
import { MEDIA_CONSTANTS } from '../../config/constants';

/**
 * Memory storage (not disk) — bounded files go straight to ImageKit and
 * never touch this process's disk. `limits.fileSize` is a hard backstop at the multipart-parsing layer,
 * on top of (not instead of) `assertValidMediaFiles`'s business-rule check —
 * this one stops an oversized body from ever finishing buffering into memory.
 */
export function buildMemoryMulterOptions(maxFileSizeBytes: number): MulterOptions {
  const maxFiles = Math.max(MEDIA_CONSTANTS.PRESCRIPTION_MAX_FILES, MEDIA_CONSTANTS.LAB_RESULT_MAX_FILES);
  return {
    storage: memoryStorage(),
    limits: {
      fileSize: maxFileSizeBytes,
      files: maxFiles,
      fields: MEDIA_CONSTANTS.MULTIPART_MAX_FIELDS,
      fieldSize: MEDIA_CONSTANTS.MULTIPART_MAX_FIELD_SIZE_BYTES,
      fieldNameSize: MEDIA_CONSTANTS.MULTIPART_MAX_FIELD_NAME_SIZE,
      // Installed Busboy emits partsLimit when the count reaches this value.
      // +1 permits all 4 metadata + 5 file parts while rejecting a tenth,
      // including ignored parts that emit neither a field nor a file event.
      parts: MEDIA_CONSTANTS.MULTIPART_MAX_FIELDS + maxFiles + 1,
    },
  };
}
