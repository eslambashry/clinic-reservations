import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  correlationId: string;
}

/**
 * Module-scoped store, not per-instance — every `RequestContextService`
 * injection shares the same storage, which is what lets the correlation ID
 * reach the logger/error filter/downstream calls without being threaded
 * through every function signature (File 11 Part 02.3/24).
 */
const storage = new AsyncLocalStorage<RequestContext>();

@Injectable()
export class RequestContextService {
  run<T>(context: RequestContext, callback: () => T): T {
    return storage.run(context, callback);
  }

  get(): RequestContext | undefined {
    return storage.getStore();
  }

  get correlationId(): string | undefined {
    return storage.getStore()?.correlationId;
  }
}
