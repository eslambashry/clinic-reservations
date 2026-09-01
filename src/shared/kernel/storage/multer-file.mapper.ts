import { UploadedMediaFile } from './media-storage.port';

/** Translates Multer's Express-specific file shape into the framework-agnostic `UploadedMediaFile` at the `api/` boundary — nothing past the controller should know about `Express.Multer.File`. */
export function toUploadedMediaFile(file: Express.Multer.File): UploadedMediaFile {
  return {
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
  };
}

export function toUploadedMediaFiles(files: Express.Multer.File[]): UploadedMediaFile[] {
  return files.map(toUploadedMediaFile);
}
