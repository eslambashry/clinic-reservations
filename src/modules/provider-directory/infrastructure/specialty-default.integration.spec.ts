import { PrismaClient } from '@prisma/client';
import { SpecialtyRepository } from './specialty.repository';

describe('specialty code default (real PostgreSQL)', () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.TEST_DATABASE_URL } },
    log: [{ emit: 'event', level: 'query' }],
  });
  const inserts: string[] = [];
  const createdCodes: string[] = [];
  const specialties = new SpecialtyRepository(prisma as any);

  beforeAll(() => {
    prisma.$on('query', ({ query }) => {
      if (query.startsWith('INSERT INTO "public"."specialties"')) inserts.push(query);
    });
  });

  afterAll(async () => {
    await prisma.specialty.deleteMany({ where: { code: { in: createdCodes } } });
    await prisma.$disconnect();
  });

  it('omits code from the Prisma insert and returns the database-generated UUIDv4', async () => {
    const defaults = await prisma.$queryRaw<{ column_default: string | null }[]>`
      SELECT column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'specialties' AND column_name = 'code'
    `;
    expect(defaults).toEqual([{ column_default: 'gen_random_uuid()' }]);

    const specialty = await prisma.$transaction((tx) => specialties.create(tx, {
      name_ar: 'تخصص اختبار القيمة الافتراضية',
    }));
    createdCodes.push(specialty.code);

    expect(specialty.code).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].split('VALUES')[0]).not.toContain('"code"');
    await expect(prisma.specialty.findUnique({ where: { code: specialty.code } }))
      .resolves.toMatchObject({ code: specialty.code, name_ar: specialty.name_ar });
  });
});
