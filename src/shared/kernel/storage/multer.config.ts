// `MulterOptions` isn't re-exported from the package root (only from this
// internal path) — `FileInterceptor`/`FilesInterceptor` themselves import it
// the same way.
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

/**
 * Memory storage (not disk) — files are small (Step 6 size caps, low
 * single-digit MB) and go straight to ImageKit, never touch this process's
 * disk. `limits.fileSize` is a hard backstop at the multipart-parsing layer,
 * on top of (not instead of) `assertValidMediaFiles`'s business-rule check —
 * this one stops an oversized body from ever finishing buffering into memory.
 */
export function buildMemoryMulterOptions(maxFileSizeBytes: number): MulterOptions {
  return {
    storage: memoryStorage(),
    limits: { fileSize: maxFileSizeBytes },
  };
}
