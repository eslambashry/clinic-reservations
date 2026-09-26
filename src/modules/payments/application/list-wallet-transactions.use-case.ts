import { Inject, Injectable } from '@nestjs/common';
import { WalletTransactionStatus, WalletTransactionType } from '@prisma/client';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { WalletRepository } from '../infrastructure/wallet.repository';
import { WalletTransactionRepository } from '../infrastructure/wallet-transaction.repository';

interface WalletTransactionCursor {
  c: string;
  i: string;
}

export interface ListWalletTransactionsInput {
  userId: string;
  cursor?: string;
  limit: number;
}

export interface WalletTransactionSummary {
  id: string;
  type: WalletTransactionType;
  status: WalletTransactionStatus;
  /** Fixed 2-decimal string — `Prisma.Decimal#toString()` drops trailing zeros (e.g. "10" for 10.00 EGP), which is not how a money amount should ever reach a client. */
  amount: string;
  resultingBalance: string | null;
  paymentIntentId: string | null;
  appointmentId: string | null;
  /** The doctor this transaction's appointment was with — `null` when the row has no `appointmentId`, or that appointment no longer exists. */
  doctorName: string | null;
  /** For a `REFUND` row: who cancelled the appointment — `'PATIENT'`/`'DOCTOR'`, or `null` when the row isn't a cancellation refund or the canceller can't be determined. */
  cancelledBy: 'PATIENT' | 'DOCTOR' | null;
  createdAt: string;
}

export interface ListWalletTransactionsResult {
  transactions: WalletTransactionSummary[];
  nextCursor: string | null;
}

/** File 12 Part 50.3 `GET /v1/wallet/transactions` — the ledger/audit-trail view the business requirements ask for explicitly ("not just wallet.balance = X"). */
@Injectable()
export class ListWalletTransactionsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WalletRepository) private readonly wallets: WalletRepository,
    @Inject(WalletTransactionRepository) private readonly walletTransactions: WalletTransactionRepository,
  ) {}

  async execute(input: ListWalletTransactionsInput): Promise<ListWalletTransactionsResult> {
    const wallet = await this.wallets.findByUserId(this.prisma, input.userId);
    if (!wallet) {
      return { transactions: [], nextCursor: null };
    }

    const cursor = decodeCursor<WalletTransactionCursor>(input.cursor);
    const transactions = await this.walletTransactions.list(this.prisma, {
      walletId: wallet.id,
      cursor: cursor ? { createdAt: cursor.c, id: cursor.i } : undefined,
      limit: input.limit,
    });

    const appointmentIds = [...new Set(transactions.map((t) => t.appointment_id).filter((id): id is string => !!id))];
    const appointmentContext = appointmentIds.length === 0 ? new Map() : await this.loadAppointmentContext(appointmentIds);

    const last = transactions.at(-1);
    return {
      transactions: transactions.map((transaction) => {
        const context = transaction.appointment_id ? appointmentContext.get(transaction.appointment_id) : undefined;
        return {
          id: transaction.id,
          type: transaction.type,
          status: transaction.status,
          amount: transaction.amount.toFixed(2),
          resultingBalance: transaction.resulting_balance?.toFixed(2) ?? null,
          paymentIntentId: transaction.payment_intent_id,
          appointmentId: transaction.appointment_id,
          doctorName: context?.doctorName ?? null,
          cancelledBy: transaction.type === 'REFUND' ? (context?.cancelledBy ?? null) : null,
          createdAt: transaction.created_at.toISOString(),
        };
      }),
      nextCursor: transactions.length === input.limit && last ? encodeCursor<WalletTransactionCursor>({ c: last.created_at.toISOString(), i: last.id }) : null,
    };
  }

  /**
   * `WalletTransaction.appointment_id` is a loose, non-FK reference (File 12
   * Part 05 — no cross-module foreign key), so this reads the shared
   * `appointment` table directly rather than importing anything from
   * `scheduling-appointments` (that module already imports `payments`; the
   * dependency never runs the other way). Same "same-request read for
   * display purposes only" reasoning as `WITH_DOCTOR_VIEW`'s doc comment.
   */
  private async loadAppointmentContext(
    appointmentIds: string[],
  ): Promise<Map<string, { doctorName: string | null; cancelledBy: 'PATIENT' | 'DOCTOR' | null }>> {
    const rows = await this.prisma.appointment.findMany({
      where: { id: { in: appointmentIds } },
      select: {
        id: true,
        patient_id: true,
        cancelled_by: true,
        affiliation: { select: { doctor: { select: { user: { select: { first_name: true, last_name: true } } } } } },
      },
    });

    const map = new Map<string, { doctorName: string | null; cancelledBy: 'PATIENT' | 'DOCTOR' | null }>();
    for (const row of rows) {
      const doctorUser = row.affiliation.doctor.user;
      const doctorName = [doctorUser.first_name, doctorUser.last_name].filter((part): part is string => !!part).join(' ') || null;
      const cancelledBy = !row.cancelled_by ? null : row.cancelled_by === row.patient_id ? 'PATIENT' : 'DOCTOR';
      map.set(row.id, { doctorName, cancelledBy });
    }
    return map;
  }
}
