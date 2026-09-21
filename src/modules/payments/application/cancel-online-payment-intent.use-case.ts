import { Inject, Injectable, Logger } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { FAWRY_GATEWAY, FawryGatewayPort, extractFawryReferenceCode } from './ports/fawry-gateway.port';
import { PaymentAttemptRepository } from '../infrastructure/payment-attempt.repository';
import { PaymentIntentRepository } from '../infrastructure/payment-intent.repository';

export interface CancelledOnlinePaymentIntent {
  method: PaymentMethod;
  fawryReferenceNumber: string | null;
}

/**
 * File 12 Part 50.5: called by `ExpireHoldsUseCase` (scheduling-appointments)
 * when a hold with an in-flight online payment expires — moves the
 * still-`CREATED` intent to `CANCELLED` so a webhook arriving afterward
 * (Part 50.6's late-payment race) finds a definitively terminal, non-`CREATED`
 * intent and knows not to attempt a normal capture.
 *
 * Split into `execute` (DB-only, takes the caller's `tx`) and
 * `notifyGatewayIfNeeded` (the live network call, deliberately NOT given a
 * `tx` — same "never hold a transaction open across live third-party I/O"
 * rule `InitiateOnlinePaymentUseCase` already follows). Only `FAWRY`
 * actually needs the second step: a Fawry reference number stays payable at
 * any physical outlet until FawryPay's own system expires it, so we
 * proactively tell FawryPay to cancel the still-unpaid order the moment our
 * hold expires — `cancelUnpaidOrder`, never `refund` (nothing was captured
 * yet; see `FawryGatewayPort`'s doc comment for why the two aren't
 * interchangeable). Best-effort: a failed cancel call is logged, not
 * thrown — our own DB state is already correctly `CANCELLED` regardless,
 * and `paymentExpiry` (sent at charge time) is the backstop if this call
 * fails. Card/Mobile Wallet never had an equivalent "cancel the unpaid
 * order upstream" step and still don't — this is Fawry-specific.
 */
@Injectable()
export class CancelOnlinePaymentIntentUseCase {
  private readonly logger = new Logger(CancelOnlinePaymentIntentUseCase.name);

  constructor(
    @Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository,
    @Inject(PaymentAttemptRepository) private readonly paymentAttempts: PaymentAttemptRepository,
    @Inject(FAWRY_GATEWAY) private readonly fawryGateway: FawryGatewayPort,
  ) {}

  async execute(tx: Prisma.TransactionClient, paymentIntentId: string): Promise<CancelledOnlinePaymentIntent | null> {
    const intent = await this.paymentIntents.findById(tx, paymentIntentId);
    if (!intent) {
      return null;
    }
    await this.paymentIntents.markCancelled(tx, intent.id, intent.version);

    if (intent.method !== 'FAWRY') {
      return { method: intent.method, fawryReferenceNumber: null };
    }

    const attempt = await this.paymentAttempts.findLatestByPaymentIntentId(tx, intent.id);
    return { method: intent.method, fawryReferenceNumber: attempt ? extractFawryReferenceCode(attempt.metadata) : null };
  }

  /** Call AFTER the `execute()` transaction has committed — never from inside it. No-op for anything but a FAWRY intent that actually reached the gateway. */
  async notifyGatewayIfNeeded(cancelled: CancelledOnlinePaymentIntent | null): Promise<void> {
    if (!cancelled || cancelled.method !== 'FAWRY' || !cancelled.fawryReferenceNumber) {
      return;
    }

    try {
      await this.fawryGateway.cancelUnpaidOrder(cancelled.fawryReferenceNumber);
    } catch (error) {
      this.logger.error(
        { err: error, fawryReferenceNumber: cancelled.fawryReferenceNumber },
        'Failed to cancel an unpaid Fawry order after its hold expired — needs manual Ops follow-up; paymentExpiry is the backstop',
      );
    }
  }
}
