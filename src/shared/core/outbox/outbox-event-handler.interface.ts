/**
 * Consumer contract for a drained outbox event (File 11 Part 20's
 * Event/Consumer table). A domain module that consumes events registers an
 * implementation with `OutboxWorker.registerHandler()` from its own
 * `onModuleInit` — this keeps the registration inside the consuming
 * module, not a central list `shared/core` would have to know about in
 * advance.
 */
export interface OutboxEventHandler {
  readonly eventName: string;
  handle(payload: unknown): Promise<void>;
}
