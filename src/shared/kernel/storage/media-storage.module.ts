import { Global, Module } from '@nestjs/common';
import { ImageKitStorageAdapter } from './imagekit-storage.adapter';
import { MEDIA_STORAGE } from './media-storage.port';

/**
 * Global, like `PrismaModule`/`RedisModule` — every domain module's
 * `application/` use-cases inject `MEDIA_STORAGE` without each declaring
 * their own import of this module. Binds to `ImageKitStorageAdapter` today;
 * swapping vendors later is a one-line change here, no use-case touches
 * `@imagekit/nodejs` directly (Step 4).
 */
@Global()
@Module({
  providers: [{ provide: MEDIA_STORAGE, useClass: ImageKitStorageAdapter }],
  exports: [MEDIA_STORAGE],
})
export class MediaStorageModule {}
