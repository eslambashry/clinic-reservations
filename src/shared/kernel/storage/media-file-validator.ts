import { DomainError } from '../../core/errors/domain-errors';
import { UploadedMediaFile } from './media-storage.port';

export interface MediaValidationRules {
  allowedMimeTypes: string[];
  maxFileSizeBytes: number;
  minFileCount?: number;
  maxFileCount?: number;
}

/**
 * File 11 Part 04 (Step 6): validate BEFORE anything touches storage —
 * MIME allowlist, size, and count, all rejected with the standard error
 * envelope rather than a vendor round trip that fails later. Operates on the
 * framework-agnostic `UploadedMediaFile` shape so it's reusable from both an
 * HTTP multipart upload and the self-registration `photo_data_uri` path.
 */
export function assertValidMediaFiles(files: UploadedMediaFile[], rules: MediaValidationRules): void {
  const minFileCount = rules.minFileCount ?? 1;

  if (files.length < minFileCount) {
    throw new DomainError(400, 'FILE_REQUIRED', `يلزم إرفاق ${minFileCount} ملف على الأقل.`);
  }

  if (rules.maxFileCount !== undefined && files.length > rules.maxFileCount) {
    throw new DomainError(400, 'TOO_MANY_FILES', `الحد الأقصى ${rules.maxFileCount} ملف.`, {
      maxFileCount: rules.maxFileCount,
      received: files.length,
    });
  }

  for (const file of files) {
    if (!rules.allowedMimeTypes.includes(file.mimeType)) {
      throw new DomainError(400, 'UNSUPPORTED_FILE_TYPE', `نوع الملف «${file.mimeType}» غير مدعوم.`, {
        allowedMimeTypes: rules.allowedMimeTypes,
        received: file.mimeType,
      });
    }

    if (file.sizeBytes > rules.maxFileSizeBytes) {
      throw new DomainError(400, 'FILE_TOO_LARGE', `حجم الملف أكبر من الحد المسموح به (${rules.maxFileSizeBytes} بايت).`, {
        maxFileSizeBytes: rules.maxFileSizeBytes,
        receivedBytes: file.sizeBytes,
      });
    }

    if (file.sizeBytes === 0) {
      throw new DomainError(400, 'EMPTY_FILE', 'الملف المرفوع فارغ. تأكد من الملف وأعد رفعه.');
    }
  }
}
