import { WithdrawalPayoutMethod, WithdrawalRequest, WithdrawalStatus } from '@prisma/client';

export interface WithdrawalView {
  id: string;
  amount: string;
  status: WithdrawalStatus;
  accountHolderName: string;
  payoutMethod: WithdrawalPayoutMethod;
  payoutAccount: string;
  /** Short-lived signed URL of the transfer proof (only once COMPLETED). */
  proofFileUrl: string | null;
  rejectReason: string | null;
  createdAt: string;
  processedAt: string | null;
  cancelledAt: string | null;
}

export function toWithdrawalView(row: WithdrawalRequest, signUrl: (stored: string) => string): WithdrawalView {
  return {
    id: row.id,
    amount: row.amount.toFixed(2),
    status: row.status,
    accountHolderName: row.account_holder_name,
    payoutMethod: row.payout_method,
    payoutAccount: row.payout_account,
    proofFileUrl: row.proof_file_url ? signUrl(row.proof_file_url) : null,
    rejectReason: row.reject_reason,
    createdAt: row.created_at.toISOString(),
    processedAt: row.processed_at?.toISOString() ?? null,
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
  };
}
