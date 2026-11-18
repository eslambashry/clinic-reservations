import { Prisma } from '@prisma/client';
import { DoctorSearchRepository, DoctorSearchParams } from './doctor-search.repository';
import { PharmacyBranchSearchRepository, PharmacyBranchSearchParams } from './pharmacy-branch-search.repository';

/** Flatten a Prisma.Sql into its text (placeholders as $n) and bound values. */
const sqlText = (sql: Prisma.Sql) => sql.sql.replace(/\s+/g, ' ');

describe('DoctorSearchRepository', () => {
  function setup() {
    const prisma = { $queryRaw: jest.fn() };
    return { prisma, repo: new DoctorSearchRepository(prisma as never) };
  }
  const base: DoctorSearchParams = { radiusKm: 10, sort: 'rating', sortDir: 'desc', limit: 20 };

  describe('count', () => {
    it('returns the count with only the visibility filters', async () => {
      const { prisma, repo } = setup();
      prisma.$queryRaw.mockResolvedValue([{ count: 3 }]);
      await expect(repo.count({ radiusKm: 10 })).resolves.toBe(3);
      const q: Prisma.Sql = prisma.$queryRaw.mock.calls[0][0];
      expect(sqlText(q)).toContain("d.status = 'VERIFIED'");
      expect(sqlText(q)).not.toContain('similarity');
      expect(sqlText(q)).not.toContain('ST_DWithin');
      expect(q.values).toEqual([]);
    });

    it('returns 0 when there are no rows', async () => {
      const { prisma, repo } = setup();
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(repo.count({ radiusKm: 10 })).resolves.toBe(0);
    });

    it('applies specialty, text and location filters', async () => {
      const { prisma, repo } = setup();
      prisma.$queryRaw.mockResolvedValue([{ count: 1 }]);
      await repo.count({ specialtyCode: 'sp', q: 'ahmed', lat: 30, lng: 31, radiusKm: 5 });
      const q: Prisma.Sql = prisma.$queryRaw.mock.calls[0][0];
      expect(sqlText(q)).toContain('d.specialty_code =');
      expect(sqlText(q)).toContain('similarity');
      expect(sqlText(q)).toContain('ST_DWithin');
      expect(q.values).toEqual(['sp', 'ahmed', 'ahmed', 31, 30, 5000]);
    });

    it('ignores a half-specified location', async () => {
      const { prisma, repo } = setup();
      prisma.$queryRaw.mockResolvedValue([{ count: 1 }]);
      await repo.count({ lat: 30, radiusKm: 5 });
      expect(sqlText(prisma.$queryRaw.mock.calls[0][0])).not.toContain('ST_DWithin');
    });
  });

  describe('search', () => {
    it('returns the raw rows and builds a plain rating/desc query without cursor or location', async () => {
      const { prisma, repo } = setup();
      prisma.$queryRaw.mockResolvedValue([{ doctor_id: 'd' }]);
      await expect(repo.search(base)).resolves.toEqual([{ doctor_id: 'd' }]);
      const q: Prisma.Sql = prisma.$queryRaw.mock.calls[0][0];
      const text = sqlText(q);
      expect(text).toContain('rating_avg DESC NULLS LAST');
      expect(text).toContain('NULL) AS distance_km');
      expect(text).not.toContain('WHERE (');
      expect(q.values).toEqual([20]);
    });

    it('sorts by distance ascending with location and a cursor', async () => {
      const { prisma, repo } = setup();
      prisma.$queryRaw.mockResolvedValue([]);
      await repo.search({
        ...base,
        sort: 'distance',
        sortDir: 'asc',
        lat: 30,
        lng: 31,
        cursor: { value: '1.5', affiliationId: 'aff' },
      });
      const q: Prisma.Sql = prisma.$queryRaw.mock.calls[0][0];
      const text = sqlText(q);
      expect(text).toContain('distance_km ASC NULLS LAST');
      expect(text).toContain('ST_Distance');
      expect(text).toContain('distance_km > (');
      expect(text).toContain('affiliation_id > (');
      expect(q.values).toEqual(expect.arrayContaining([30, 31, '1.5', 'aff', 20]));
    });

    it('sorts by price with a descending cursor', async () => {
      const { prisma, repo } = setup();
      prisma.$queryRaw.mockResolvedValue([]);
      await repo.search({ ...base, sort: 'price', sortDir: 'desc', cursor: { value: '100', affiliationId: 'aff' } });
      const text = sqlText(prisma.$queryRaw.mock.calls[0][0]);
      expect(text).toContain('consult_fee DESC NULLS LAST');
      expect(text).toContain('consult_fee < (');
    });

    it('includes specialty and text filters in the CTE', async () => {
      const { prisma, repo } = setup();
      prisma.$queryRaw.mockResolvedValue([]);
      await repo.search({ ...base, specialtyCode: 'sp', q: 'x' });
      const q: Prisma.Sql = prisma.$queryRaw.mock.calls[0][0];
      expect(q.values).toEqual(expect.arrayContaining(['sp', 'x']));
    });
  });
});

describe('PharmacyBranchSearchRepository', () => {
  function setup() {
    const prisma = { $queryRaw: jest.fn() };
    return { prisma, repo: new PharmacyBranchSearchRepository(prisma as never) };
  }
  const base: PharmacyBranchSearchParams = { radiusKm: 10, sort: 'name', sortDir: 'asc', limit: 15 };

  it('builds a plain name-sorted query with no optional filters', async () => {
    const { prisma, repo } = setup();
    prisma.$queryRaw.mockResolvedValue([{ branch_id: 'b' }]);
    await expect(repo.search(base)).resolves.toEqual([{ branch_id: 'b' }]);
    const q: Prisma.Sql = prisma.$queryRaw.mock.calls[0][0];
    const text = sqlText(q);
    expect(text).toContain('brand_name ASC NULLS LAST');
    expect(text).toContain('NULL) AS distance_km');
    expect(text).not.toContain('ILIKE');
    expect(text).not.toContain('delivery_capable =');
    expect(text).not.toContain('ST_DWithin');
    expect(q.values).toEqual([15]);
  });

  it('applies text, deliveryCapable (false is still a filter) and location filters', async () => {
    const { prisma, repo } = setup();
    prisma.$queryRaw.mockResolvedValue([]);
    await repo.search({ ...base, q: 'nile', deliveryCapable: false, lat: 30, lng: 31, radiusKm: 2 });
    const q: Prisma.Sql = prisma.$queryRaw.mock.calls[0][0];
    const text = sqlText(q);
    expect(text).toContain('ILIKE');
    expect(text).toContain('pb.delivery_capable =');
    expect(text).toContain('ST_DWithin');
    expect(text).toContain('ST_Distance');
    expect(q.values).toEqual(expect.arrayContaining(['%nile%', 'nile', false, 31, 30, 2000, 15]));
  });

  it('uses a numeric cursor when sorting by distance', async () => {
    const { prisma, repo } = setup();
    prisma.$queryRaw.mockResolvedValue([]);
    await repo.search({ ...base, sort: 'distance', sortDir: 'desc', cursor: { value: '2.5', branchId: 'br' } });
    const q: Prisma.Sql = prisma.$queryRaw.mock.calls[0][0];
    const text = sqlText(q);
    expect(text).toContain('distance_km < (');
    expect(text).toContain(')::numeric');
    expect(text).toContain('branch_id > (');
    expect(q.values).toEqual(expect.arrayContaining(['2.5', 'br']));
  });

  it('uses a text cursor when sorting by name', async () => {
    const { prisma, repo } = setup();
    prisma.$queryRaw.mockResolvedValue([]);
    await repo.search({ ...base, cursor: { value: 'Alpha', branchId: 'br' } });
    const q: Prisma.Sql = prisma.$queryRaw.mock.calls[0][0];
    const text = sqlText(q);
    expect(text).toContain('brand_name > ');
    expect(text).not.toContain(')::numeric');
    expect(q.values).toEqual(expect.arrayContaining(['Alpha', 'br']));
  });
});
