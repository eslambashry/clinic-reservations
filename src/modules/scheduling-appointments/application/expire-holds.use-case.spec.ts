import { ExpireHoldsUseCase } from './expire-holds.use-case';

function buildTx() {
  return {} as any;
}

describe('ExpireHoldsUseCase', () => {
  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const holds = { findActiveExpired: jest.fn(), markExpired: jest.fn() };
    const slots = { markOpen: jest.fn() };
    const useCase = new ExpireHoldsUseCase(prisma as any, holds as any, slots as any);
    return { tx, holds, slots, useCase };
  }

  it('releases the slot for every hold it actually flips to EXPIRED', async () => {
    const { tx, holds, slots, useCase } = setup();
    holds.findActiveExpired.mockResolvedValue([
      { id: 'hold-1', slot_id: 'slot-1' },
      { id: 'hold-2', slot_id: 'slot-2' },
    ]);
    holds.markExpired.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await useCase.execute();

    expect(result.expired).toBe(1);
    expect(slots.markOpen).toHaveBeenCalledTimes(1);
    expect(slots.markOpen).toHaveBeenCalledWith(tx, 'slot-1');
  });

  it('does not release a slot for a hold a concurrent confirm already converted (markExpired returns false)', async () => {
    const { holds, slots, useCase } = setup();
    holds.findActiveExpired.mockResolvedValue([{ id: 'hold-1', slot_id: 'slot-1' }]);
    holds.markExpired.mockResolvedValue(false);

    const result = await useCase.execute();

    expect(result.expired).toBe(0);
    expect(slots.markOpen).not.toHaveBeenCalled();
  });

  it('isolates one hold failing from the rest of the sweep', async () => {
    const { holds, slots, useCase } = setup();
    holds.findActiveExpired.mockResolvedValue([
      { id: 'hold-1', slot_id: 'slot-1' },
      { id: 'hold-2', slot_id: 'slot-2' },
    ]);
    holds.markExpired.mockRejectedValueOnce(new Error('db blip')).mockResolvedValueOnce(true);

    const result = await useCase.execute();

    expect(result.expired).toBe(1);
    expect(slots.markOpen).toHaveBeenCalledTimes(1);
  });
});
