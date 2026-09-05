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

    const last = transactions.at(-1);
    return {
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        status: transaction.status,
        amount: transaction.amount.toFixed(2),
        resultingBalance: transaction.resulting_balance?.toFixed(2) ?? null,
        paymentIntentId: transaction.payment_intent_id,
        appointmentId: transaction.appointment_id,
        createdAt: transaction.created_at.toISOString(),
      })),
      nextCursor: transactions.length === input.limit && last ? encodeCursor<WalletTransactionCursor>({ c: last.created_at.toISOString(), i: last.id }) : null,
    };
  }
}
