import { Injectable } from '@nestjs/common';
import { Prisma, Wallet } from '@prisma/client';

@Injectable()
export class WalletRepository {
  findByUserId(db: Prisma.TransactionClient, userId: string): Promise<Wallet | null> {
    return db.wallet.findUnique({ where: { user_id: userId } });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<Wallet | null> {
    return db.wallet.findUnique({ where: { id } });
  }

  /**
   * File 12 Part 50.3: wallets are created lazily (first top-up or first
   * appointment-payment attempt), not at signup. `skipDuplicates`-style
   * race handling: a unique-constraint violation on `user_id` (two
   * concurrent first-uses) is treated as "someone else already created it,"
   * not an error — the caller re-reads.
   */
  async getOrCreate(db: Prisma.TransactionClient, userId: string, currency: string): Promise<Wallet> {
    const existing = await this.findByUserId(db, userId);
    if (existing) {
      return existing;
    }
    try {
      return await db.wallet.create({ data: { user_id: userId, currency, balance: 0 } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const wallet = await this.findByUserId(db, userId);
        if (wallet) {
          return wallet;
        }
      }
      throw error;
    }
  }

  /**
   * File 12 Part 50.4: the ONLY way a wallet balance ever increases —
   * `UPDATE ... SET balance = balance + amount`, not "read then write," so
   * two concurrent credits (e.g. a duplicate top-up webhook slipping past
   * the outer idempotency check) still sum correctly rather than racing.
   */
  credit(db: Prisma.TransactionClient, id: string, amount: string): Promise<Wallet> {
    return db.wallet.update({
      where: { id },
      data: { balance: { increment: amount }, version: { increment: 1 } },
    });
  }

  /**
   * File 12 Part 50.4 — the core concurrency guarantee the business
   * requirements call out explicitly: "two concurrent requests could both
   * pass an `if balance >= amount` app-level check." This is a single
   * conditional `UPDATE ... WHERE balance >= amount`; Postgres row-locks the
   * row for the duration of the statement and re-evaluates the predicate
   * against the latest committed value, so a second concurrent debit for
   * the same wallet either serializes behind the first (and then correctly
   * sees the reduced balance) or is rejected outright — the balance can
   * never go negative, regardless of interleaving. `false` means
   * insufficient balance (the wallet row itself is assumed to already
   * exist — callers create it lazily before ever attempting a debit).
   */
  async debit(db: Prisma.TransactionClient, id: string, amount: string): Promise<boolean> {
    const result = await db.wallet.updateMany({
      where: { id, balance: { gte: amount } },
      data: { balance: { decrement: amount }, version: { increment: 1 } },
    });
    return result.count === 1;
  }
}
