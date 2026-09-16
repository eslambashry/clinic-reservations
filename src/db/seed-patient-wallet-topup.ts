import { randomUUID } from 'node:crypto';
import { prisma } from './client';

/**
 * Dev-only wallet top-up seed: finds a patient by phone and sets their
 * wallet balance to a fixed amount, recording a matching `TOP_UP`/
 * `COMPLETED` `wallet_transactions` row so the ledger stays consistent
 * with the balance (mirrors what `ProcessWalletTopUpUseCase` would leave
 * behind, without going through a real Paymob payment).
 *
 * Idempotent on the wallet itself (upsert on `user_id`), but each run
 * appends a new transaction row — re-running bumps the balance again
 * rather than being a no-op, which is the point (run it whenever you
 * need more test balance).
 *
 * Run with: `npx tsx src/db/seed-patient-wallet-topup.ts <phone> <amount>`
 * Example:  `npx tsx src/db/seed-patient-wallet-topup.ts +201112223301 5000`
 */

async function main() {
  const [, , phoneArg, amountArg] = process.argv;
  const phone = phoneArg ?? '+201112223301';
  const amount = (amountArg ?? '5000').trim();

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    throw new Error(`No user found with phone ${phone}`);
  }

  const wallet = await prisma.wallet.upsert({
    where: { user_id: user.id },
    update: { balance: amount },
    create: { id: randomUUID(), user_id: user.id, balance: amount, currency: 'EGP' },
  });

  await prisma.walletTransaction.create({
    data: {
      id: randomUUID(),
      wallet_id: wallet.id,
      type: 'TOP_UP',
      status: 'COMPLETED',
      amount,
      resulting_balance: amount,
      idempotency_key: `manual-dev-topup-${randomUUID()}`,
    },
  });

  console.log(`✅ ${phone} (${user.first_name ?? ''} ${user.last_name ?? ''}) wallet balance set to ${amount} EGP`);
}

main()
  .catch((error) => {
    console.error('❌ Wallet top-up seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
