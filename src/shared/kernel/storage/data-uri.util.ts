import { UploadedMediaFile } from './media-storage.port';

const DATA_URI_PATTERN = /^data:([\w.+-]+\/[\w.+-]+);base64,([a-zA-Z0-9+/]+=*)$/;

/**
 * Parses a `data:<mime>;base64,<payload>` string into an `UploadedMediaFile`.
 * Returns `null` for anything that doesn't match — the caller decides
 * whether that's a validation error, never throws itself (keeps this a pure
 * utility, same as the rest of `shared/kernel`).
 */
export function parseDataUri(value: string, originalName: string): UploadedMediaFile | null {
  const match = DATA_URI_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }

  const [, mimeType, base64Payload] = match;
  const buffer = Buffer.from(base64Payload, 'base64');

  return { buffer, originalName, mimeType, sizeBytes: buffer.length };
}
