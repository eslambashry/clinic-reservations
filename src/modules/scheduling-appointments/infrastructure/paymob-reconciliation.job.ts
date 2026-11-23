import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReconcilePaymobPaymentsUseCase } from '../application/reconcile-paymob-payments.use-case';

/** Every 5 minutes: reconcile pending online payments with Paymob. Registered like `HoldExpiryJob` (only fires in the worker). */
@Injectable()
export class PaymobReconciliationJob {
  private readonly logger = new Logger(PaymobReconciliationJob.name);

  constructor(@Inject(ReconcilePaymobPaymentsUseCase) private readonly reconcile: ReconcilePaymobPaymentsUseCase) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run(): Promise<void> {
    const result = await this.reconcile.execute();
    if (result.paid > 0 || result.failed > 0) {
      this.logger.log(`Paymob reconciliation: ${result.checked} checked, ${result.paid} paid, ${result.failed} failed`);
    }
  }
}
