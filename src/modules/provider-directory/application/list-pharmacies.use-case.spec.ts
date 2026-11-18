import { encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { ListPharmaciesUseCase } from './list-pharmacies.use-case';

function row(id: string, verified: Date | null = null) {
  return {
    id,
    legal_name: `legal-${id}`,
    brand_name: `brand-${id}`,
    region_code: null,
    status: 'ACTIVE',
    verified_at: verified,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('ListPharmaciesUseCase', () => {
  function setup() {
    const prisma = {} as any;
    const pharmacies = { list: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) };
    const useCase = new ListPharmaciesUseCase(prisma, pharmacies as any);
    return { prisma, pharmacies, useCase };
  }

  it('offset mode returns page meta and no cursor', async () => {
    const { prisma, pharmacies, useCase } = setup();
    pharmacies.list.mockResolvedValue([row('p1', new Date('2026-02-01T00:00:00.000Z'))]);
    pharmacies.count.mockResolvedValue(1);

    const res = await useCase.execute({ page: 1, limit: 10, status: 'ACTIVE' as any });

    expect(pharmacies.list).toHaveBeenCalledWith(prisma, { status: 'ACTIVE', limit: 10, skip: 0 });
    expect(pharmacies.count).toHaveBeenCalledWith(prisma, { status: 'ACTIVE' });
    expect(res.nextCursor).toBeNull();
    expect(res.items[0]).toMatchObject({
      id: 'p1', legalName: 'legal-p1', brandName: 'brand-p1', regionCode: null,
      verifiedAt: '2026-02-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('cursor mode with no more rows yields null nextCursor and null verifiedAt', async () => {
    const { pharmacies, useCase } = setup();
    pharmacies.list.mockResolvedValue([row('p1')]);
    const res = await useCase.execute({ limit: 5 });
    expect(pharmacies.list).toHaveBeenCalledWith(expect.anything(), { status: undefined, cursor: undefined, limit: 6 });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].verifiedAt).toBeNull();
    expect(res.nextCursor).toBeNull();
  });

  it('cursor mode paginates, trims the extra row and decodes the cursor', async () => {
    const { pharmacies, useCase } = setup();
    pharmacies.list.mockResolvedValue([row('p1'), row('p2'), row('p3')]);
    const cursor = encodeCursor({ c: '2025-12-31T00:00:00.000Z', i: 'p0' });

    const res = await useCase.execute({ limit: 2, cursor });

    expect(pharmacies.list).toHaveBeenCalledWith(expect.anything(), {
      status: undefined, cursor: { createdAt: '2025-12-31T00:00:00.000Z', id: 'p0' }, limit: 3,
    });
    expect(res.items.map((i) => i.id)).toEqual(['p1', 'p2']);
    expect(res.nextCursor).toEqual(encodeCursor({ c: '2026-01-01T00:00:00.000Z', i: 'p2' }));
  });

  it('caps the limit at 50 and defaults to 20', async () => {
    const { pharmacies, useCase } = setup();
    await useCase.execute({ limit: 500 });
    expect(pharmacies.list).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ limit: 51 }));
    await useCase.execute({});
    expect(pharmacies.list).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ limit: 21 }));
  });
});
