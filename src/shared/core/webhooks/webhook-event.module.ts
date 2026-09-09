import { Global, Module } from '@nestjs/common';
import { WebhookEventRepository } from './webhook-event.repository';

/** Global, same pattern as `PolicyConfigModule`/`PrismaModule` — see `WebhookEventRepository`'s own doc comment. */
@Global()
@Module({
  providers: [WebhookEventRepository],
  exports: [WebhookEventRepository],
})
export class WebhookEventModule {}
