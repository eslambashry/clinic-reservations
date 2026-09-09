export const PUSH_NOTIFICATION_SENDER = Symbol('PUSH_NOTIFICATION_SENDER');

export interface PushNotificationMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushSendResult {
  /** Tokens FCM reported as invalid/unregistered — the caller can use this to prune stale `devices` rows later; not acted on here to keep this port a pure sender. */
  invalidTokens: string[];
}

/**
 * File 12 Part 53: `devices.fcm_token` already committed this codebase to
 * Firebase Cloud Messaging (the column is literally named for it) — unlike
 * SMS (`DEC-003`, still open), this isn't an open decision, so the bound
 * implementation is a real FCM adapter, not a logging placeholder. Mirrors
 * `PaymentGatewayPort`'s shape: use-cases depend on this interface only.
 */
export interface PushNotificationPort {
  send(tokens: string[], message: PushNotificationMessage): Promise<PushSendResult>;
}
