import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ImageKit, { toFile } from '@imagekit/nodejs';
import { ExternalProviderError } from '../../core/errors/domain-errors';
import { MediaStoragePort, MediaStorageUploadOptions, StoredMedia, UploadedMediaFile } from './media-storage.port';

/**
 * `DEC-009` resolved: ImageKit is the object-storage vendor. The only class
 * in the codebase that imports `@imagekit/nodejs` — every feature module
 * goes through `MediaStoragePort` instead (Step 4).
 */
@Injectable()
export class ImageKitStorageAdapter implements MediaStoragePort {
  private readonly logger = new Logger(ImageKitStorageAdapter.name);
  private readonly client: ImageKit;
  private readonly urlEndpoint: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.urlEndpoint = config.get<string>('imagekit.urlEndpoint') as string;
    this.client = new ImageKit({ privateKey: config.get<string>('imagekit.privateKey') as string });
  }

  async upload(file: UploadedMediaFile, options: MediaStorageUploadOptions): Promise<StoredMedia> {
    try {
      const uploadable = await toFile(file.buffer, file.originalName, { type: file.mimeType });
      const result = await this.client.files.upload({
        file: uploadable,
        fileName: file.originalName,
        folder: options.folder,
        isPrivateFile: options.isPrivate,
        useUniqueFileName: true,
      });

      if (!result.url || !result.fileId || !result.filePath) {
        throw new Error('ImageKit upload response is missing url/fileId/filePath.');
      }

      return { url: result.url, fileId: result.fileId, filePath: result.filePath };
    } catch (error) {
      this.logger.error({ err: error }, 'ImageKit upload failed');
      throw new ExternalProviderError('ImageKit', 502, error);
    }
  }

  getSignedUrl(storedUrl: string, expireSeconds?: number): string {
    const path = storedUrl.startsWith(this.urlEndpoint) ? storedUrl.slice(this.urlEndpoint.length) : storedUrl;
    return this.client.helper.buildSrc({
      src: path,
      urlEndpoint: this.urlEndpoint,
      signed: true,
      expiresIn: expireSeconds,
    });
  }
}
