import { LabBranchSearchRepository } from './lab-branch-search.repository';

function sqlText(sql: any): string {
  return sql.sql ?? sql.strings.join('?');
}

function setup() {
  const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ branch_id: 'b1' }]) };
  return { prisma, repo: new LabBranchSearchRepository(prisma as any) };
}

const base = { radiusKm: 10, sort: 'name' as const, sortDir: 'asc' as const, limit: 21 };

describe('LabBranchSearchRepository', () => {
  it('builds the minimal query with no location, q, or cursor', async () => {
    const { prisma, repo } = setup();
    const rows = await repo.search(base);

    expect(rows).toEqual([{ branch_id: 'b1' }]);
    const query = prisma.$queryRaw.mock.calls[0][0];
    const text = sqlText(query);
    expect(text).toContain("l.status = 'VERIFIED'");
    expect(text).not.toContain('ST_DWithin');
    expect(text).not.toContain('ILIKE');
    expect(text).toContain('ASC');
    expect(query.values).toContain(21);
  });

  it('adds full-text, home collection and radius filters when provided', async () => {
    const { prisma, repo } = setup();
    await repo.search({ ...base, q: 'nile', lat: 30, lng: 31, homeCollectionCapable: false, sort: 'distance', sortDir: 'desc' });

    const query = prisma.$queryRaw.mock.calls[0][0];
    const text = sqlText(query);
    expect(text).toContain('ILIKE');
    expect(text).toContain('lb.home_collection_capable');
    expect(text).toContain('ST_DWithin');
    expect(text).toContain('DESC');
    expect(query.values).toEqual(expect.arrayContaining(['%nile%', 'nile', false, 10000, 30, 31]));
  });

  it('applies a text cursor when sorting by name', async () => {
    const { prisma, repo } = setup();
    await repo.search({ ...base, cursor: { value: 'Nile', branchId: 'br-1' } });

    const query = prisma.$queryRaw.mock.calls[0][0];
    expect(sqlText(query)).toContain('branch_id >');
    expect(query.values).toEqual(expect.arrayContaining(['Nile', 'br-1']));
    expect(sqlText(query)).not.toContain('::numeric');
  });

  it('casts the cursor to numeric when sorting by distance (descending compare)', async () => {
    const { prisma, repo } = setup();
    await repo.search({ ...base, sort: 'distance', sortDir: 'desc', lat: 1, lng: 2, cursor: { value: '3.5', branchId: 'br-1' } });

    const query = prisma.$queryRaw.mock.calls[0][0];
    expect(sqlText(query)).toContain('::numeric');
    expect(query.values).toEqual(expect.arrayContaining(['3.5', 'br-1']));
  });
});
