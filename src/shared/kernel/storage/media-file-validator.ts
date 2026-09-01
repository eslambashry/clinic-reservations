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
    throw new DomainError(400, 'FILE_REQUIRED', `At least ${minFileCount} file(s) required.`);
  }

  if (rules.maxFileCount !== undefined && files.length > rules.maxFileCount) {
    throw new DomainError(400, 'TOO_MANY_FILES', `A maximum of ${rules.maxFileCount} file(s) is allowed.`, {
      maxFileCount: rules.maxFileCount,
      received: files.length,
    });
  }

  for (const file of files) {
    if (!rules.allowedMimeTypes.includes(file.mimeType)) {
      throw new DomainError(400, 'UNSUPPORTED_FILE_TYPE', `File type "${file.mimeType}" is not supported.`, {
        allowedMimeTypes: rules.allowedMimeTypes,
        received: file.mimeType,
      });
    }

    if (file.sizeBytes > rules.maxFileSizeBytes) {
      throw new DomainError(400, 'FILE_TOO_LARGE', `File exceeds the maximum size of ${rules.maxFileSizeBytes} bytes.`, {
        maxFileSizeBytes: rules.maxFileSizeBytes,
        receivedBytes: file.sizeBytes,
      });
    }

    if (file.sizeBytes === 0) {
      throw new DomainError(400, 'EMPTY_FILE', 'An uploaded file is empty.');
    }
  }
}
