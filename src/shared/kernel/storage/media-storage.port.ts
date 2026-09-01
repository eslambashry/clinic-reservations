/**
 * Framework-agnostic representation of a file a user submitted, already read
 * into memory (from Multer's memory storage, or decoded from a base64 data
 * URI) — no `Express.Multer.File`/HTTP concept leaks past the `api/` layer,
 * same boundary discipline as every other port in this codebase.
 */
export interface UploadedMediaFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface StoredMedia {
  /** Full delivery URL. For a private file this is the *unsigned* URL — not directly fetchable, only useful as the value to persist; a signed URL must be generated at read time via `getSignedUrl`. */
  url: string;
  /** Vendor-side identifier — not persisted today (no column for it), kept on the result for callers that need it (e.g. future delete support). */
  fileId: string;
  /** Path relative to the vendor's URL endpoint — what `getSignedUrl` needs to re-derive from a stored URL. */
  filePath: string;
}

export interface MediaStorageUploadOptions {
  /** Vendor-side folder, e.g. `prescriptions/<patientId>` (Step 8 — logical folders, one per feature). */
  folder: string;
  /**
   * PHI/sensitive documents (prescriptions, provider verification documents)
   * upload as private — File 11's PHI table requires "restricted IAM", not a
   * publicly guessable URL. Doctor profile photos upload public — they're
   * meant to be shown on the public doctor search/profile page.
   */
  isPrivate: boolean;
}

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

/**
 * `DEC-009` (object storage vendor) resolved to ImageKit. This port is the
 * one seam every feature module uploads through — no module talks to the
 * ImageKit SDK directly (Step 4: one shared abstraction, not one integration
 * per module). Swapping vendors later means swapping the DI binding in
 * `media-storage.module.ts`, same shape as `OcrExtractorPort`/`OtpSenderPort`.
 */
export interface MediaStoragePort {
  upload(file: UploadedMediaFile, options: MediaStorageUploadOptions): Promise<StoredMedia>;

  /**
   * Re-derives a time-limited, signed delivery URL for a file that was
   * uploaded with `isPrivate: true`, from its stored (unsigned) URL. Pure/
   * synchronous (HMAC computed locally, no network call) — safe to call from
   * a read-path use-case without an extra await-worthy round trip. Never
   * persist the result; regenerate on every read.
   */
  getSignedUrl(storedUrl: string, expireSeconds?: number): string;
}
