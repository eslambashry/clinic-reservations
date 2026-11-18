import { encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { ListLaboratoriesUseCase } from './list-laboratories.use-case';

function row(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    legal_name: `Legal ${id}`,
    brand_name: `Brand ${id}`,
    tax_id: null,
    region_code: null,
    status: 'PENDING',
    verified_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

function setup() {
  const prisma = { p: true } as any;
  const laboratories = { list: jest.fn(), count: jest.fn().mockResolvedValue(7) };
  return { prisma, laboratories, useCase: new ListLaboratoriesUseCase(prisma, laboratories as any) };
}

describe('ListLaboratoriesUseCase', () => {
  it('uses offset mode when page is provided', async () => {
    const s = setup();
    s.laboratories.list.mockResolvedValue([row('a', { verified_at: new Date('2026-02-01T00:00:00Z'), tax_id: 'T', region_code: 'EG' })]);

    const result = await s.useCase.execute({ page: 2, limit: 5, status: 'VERIFIED' as any });

    expect(s.laboratories.list).toHaveBeenCalledWith(s.prisma, { status: 'VERIFIED', limit: 5, skip: 5 });
    expect(s.laboratories.count).toHaveBeenCalledWith(s.prisma, { status: 'VERIFIED' });
    expect(result).toMatchObject({ nextCursor: null, totalCount: 7, page: 2, limit: 5, totalPages: 2 });
    expect(result.items[0]).toEqual({
      id: 'a',
      legalName: 'Legal a',
      brandName: 'Brand a',
      taxId: 'T',
      regionCode: 'EG',
      status: 'PENDING',
      verifiedAt: '2026-02-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('returns a next cursor when the cursor page has more rows', async () => {
    const s = setup();
    s.laboratories.list.mockResolvedValue([row('a'), row('b'), row('c')]);

    const result = await s.useCase.execute({ limit: 2 });

    expect(s.laboratories.list).toHaveBeenCalledWith(s.prisma, { status: undefined, cursor: undefined, limit: 3 });
    expect(result.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.nextCursor).toBe(encodeCursor({ c: '2026-01-01T00:00:00.000Z', i: 'b' }));
  });

  it('decodes an incoming cursor and returns no next cursor on the last page', async () => {
    const s = setup();
    s.laboratories.list.mockResolvedValue([row('a')]);
    const cursor = encodeCursor({ c: '2026-01-01T00:00:00.000Z', i: 'z' });

    const result = await s.useCase.execute({ cursor });

    expect(s.laboratories.list).toHaveBeenCalledWith(s.prisma, {
      status: undefined,
      cursor: { createdAt: '2026-01-01T00:00:00.000Z', id: 'z' },
      limit: 21,
    });
    expect(result.nextCursor).toBeNull();
  });

  it('caps the limit at the maximum', async () => {
    const s = setup();
    s.laboratories.list.mockResolvedValue([]);
    await s.useCase.execute({ limit: 500 });
    expect(s.laboratories.list).toHaveBeenCalledWith(s.prisma, expect.objectContaining({ limit: 51 }));
  });
});
