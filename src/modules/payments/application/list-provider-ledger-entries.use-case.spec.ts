import { Prisma } from '@prisma/client';
import { ListProviderLedgerEntriesUseCase } from './list-provider-ledger-entries.use-case';

function row(index: number) {
  return {
    id: `entry-${index}`,
    provider_type: 'DOCTOR',
    provider_id: '11111111-1111-4111-8111-111111111111',
    entry_type: 'EARNING',
    amount: new Prisma.Decimal('10.00'),
    related_payment_intent_id: null,
    created_at: new Date(`2026-09-16T00:${String(index).padStart(2, '0')}:00.000Z`),
  } as any;
}

describe('ListProviderLedgerEntriesUseCase', () => {
  function setup(rows: any[], totalCount = rows.length) {
    const ledger = {
      list: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(totalCount),
    };
    return { ledger, useCase: new ListProviderLedgerEntriesUseCase({} as any, ledger as any) };
  }

  it('requests one extra row and does not invent a cursor for an exactly-full final page', async () => {
    const { ledger, useCase } = setup([row(1), row(2)]);

    const result = await useCase.execute({ limit: 2 });

    expect(ledger.list).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ limit: 3 }));
    expect(result.entries).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it('trims the extra row and returns a cursor only when another page exists', async () => {
    const { useCase } = setup([row(1), row(2), row(3)]);

    const result = await useCase.execute({ limit: 2 });

    expect(result.entries.map((entry) => entry.id)).toEqual(['entry-1', 'entry-2']);
    expect(result.nextCursor).not.toBeNull();
  });
});
