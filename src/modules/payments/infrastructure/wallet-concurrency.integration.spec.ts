import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { WalletRepository } from './wallet.repository';
import { AppConfigModule } from '../../../shared/config/config.module';
import { PrismaModule } from '../../../shared/kernel/prisma/prisma.module';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';

dotenv.config();

/**
 * File 12 Part 50.4 / this task's explicit concurrency requirement: "two
 * concurrent requests attempt to spend the same wallet balance" must never
 * both succeed if the balance can't cover both. `WalletRepository.debit`'s
 * single conditional `UPDATE ... WHERE balance >= amount` is the mechanism
 * under test — run against a real Postgres (not mocks) because the whole
 * point is proving actual row-level locking prevents the overdraft, not
 * just that the SQL string looks right.
 */
describe('WalletRepository concurrent debit (integration, real Postgres)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let wallets: WalletRepository;

  const suffix = randomUUID().slice(0, 8);
  let userId: string;
  let walletId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule],
      providers: [WalletRepository],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    wallets = moduleRef.get(WalletRepository);

    const user = await prisma.user.create({ data: { phone: `+2012${suffix}0`, first_name: 'Wallet', last_name: 'Test' } });
    userId = user.id;
    const wallet = await prisma.wallet.create({ data: { user_id: userId, currency: 'EGP', balance: '100.00' } });
    walletId = wallet.id;
  });

  afterAll(async () => {
    await prisma.walletTransaction.deleteMany({ where: { wallet_id: walletId } });
    await prisma.wallet.deleteMany({ where: { id: walletId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await moduleRef.close();
  });

  it('lets only as many of N concurrent debits succeed as the starting balance actually covers', async () => {
    // Balance 100.00, five concurrent debits of 30.00 each = 150.00 demanded
    // — at most 3 can legitimately succeed (90.00), never 4+.
    const attempts = 5;
    const amount = '30.00';

    const results = await Promise.all(
      Array.from({ length: attempts }, () => wallets.debit(prisma, walletId, amount)),
    );

    const succeeded = results.filter(Boolean).length;
    expect(succeeded).toBe(3);

    const finalWallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
    expect(Number(finalWallet.balance)).toBe(10);
    // Never negative, regardless of how many attempts raced.
    expect(Number(finalWallet.balance)).toBeGreaterThanOrEqual(0);
  });

  it('rejects a single debit that exceeds the current balance', async () => {
    const succeeded = await wallets.debit(prisma, walletId, '9999.00');
    expect(succeeded).toBe(false);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
    expect(Number(wallet.balance)).toBe(10);
  });

  it('credit is additive and safe under concurrent top-ups', async () => {
    await Promise.all(Array.from({ length: 4 }, () => wallets.credit(prisma, walletId, '5.00')));

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
    expect(Number(wallet.balance)).toBe(30);
  });
});
