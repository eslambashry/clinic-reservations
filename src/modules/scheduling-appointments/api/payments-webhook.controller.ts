import { Body, Controller, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../shared/core/auth/public.decorator';
import { ProcessPaymentWebhookUseCase } from '../application/process-payment-webhook.use-case';

/**
 * File 11 Part 05.6 `POST /v1/webhooks/payments/{provider}`. `@Public()` —
 * the gateway, not an authenticated MedSuper user, calls this; authenticity
 * is established entirely by `PaymentGatewayPort.verifyWebhookSignature`
 * inside the use-case (File 11 Part 06's "never trust a frontend-reported
 * success flag" extends here too — a webhook body is exactly that, just
 * from a different frontend). See `ProcessPaymentWebhookUseCase`'s own doc
 * comment for why this controller lives here instead of in `payments`.
 *
 * Always responds `200` — a gateway retries on anything else, and every
 * failure mode this handler can hit (bad signature, unknown reference,
 * already-processed) is something a retry cannot fix, so there's nothing to
 * gain by surfacing it as an HTTP error to the gateway.
 */
@ApiExcludeController()
@Public()
@Controller('webhooks/payments')
export class PaymentsWebhookController {
  constructor(@Inject(ProcessPaymentWebhookUseCase) private readonly processWebhook: ProcessPaymentWebhookUseCase) {}

  @Post(':provider')
  @HttpCode(200)
  async handle(
    @Param('provider') provider: string,
    @Body() body: Record<string, unknown>,
    @Query('hmac') hmac: string | undefined,
  ): Promise<{ received: true }> {
    await this.processWebhook.execute({ provider, rawBody: body, hmac });
    return { received: true };
  }
}
