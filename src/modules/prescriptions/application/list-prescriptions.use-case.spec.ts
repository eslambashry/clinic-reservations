import { ListPrescriptionsUseCase } from './list-prescriptions.use-case';

function buildTx() {
  return {} as any;
}

describe('ListPrescriptionsUseCase', () => {
  function setup() {
    const prisma = buildTx();
    const prescriptions = { listQualityCheckPassed: jest.fn() };
    const useCase = new ListPrescriptionsUseCase(prisma as any, prescriptions as any);
    return { prescriptions, useCase };
  }

  it('returns items with no nextCursor when fewer rows than the limit come back', async () => {
    const { prescriptions, useCase } = setup();
    prescriptions.listQualityCheckPassed.mockResolvedValue([{ id: 'rx-1', created_at: new Date('2026-01-01T00:00:00Z') }]);

    const result = await useCase.execute({ limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it('returns a nextCursor and trims the extra row when more rows exist than the limit', async () => {
    const { prescriptions, useCase } = setup();
    const rows = [
      { id: 'rx-1', created_at: new Date('2026-01-01T00:00:00Z') },
      { id: 'rx-2', created_at: new Date('2026-01-02T00:00:00Z') },
    ];
    prescriptions.listQualityCheckPassed.mockResolvedValue(rows);

    const result = await useCase.execute({ limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('rx-1');
    expect(result.nextCursor).not.toBeNull();
    expect(prescriptions.listQualityCheckPassed).toHaveBeenCalledWith(expect.anything(), { cursor: undefined, limit: 2 });
  });
});
