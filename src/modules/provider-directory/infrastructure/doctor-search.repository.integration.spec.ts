import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { DoctorSearchRepository } from './doctor-search.repository';

dotenv.config();

/**
 * File 11 Part 26 "Database" test type — constraint/query behavior against
 * a real Postgres (the local docker-compose instance, File 12 Part 32.17),
 * not mocked. Exercises the raw PostGIS/pg_trgm query in
 * `doctor-search.repository.ts` end to end: specialty filter, radius
 * filter/distance sort, visibility-chain filtering, and cursor pagination.
 */
describe('DoctorSearchRepository (integration)', () => {
  const prisma = new PrismaClient();
  const repository = new DoctorSearchRepository(prisma as any);

  const suffix = randomUUID().slice(0, 8);
  const specialtyCode = `TEST_SPECIALTY_${suffix}`;

  // Cairo-ish coordinates a few km apart, so radius filtering is meaningful.
  const NEAR = { lat: 30.0444, lng: 31.2357 };
  const FAR = { lat: 31.2001, lng: 29.9187 }; // Alexandria — well outside a 15km radius from NEAR

  let clinicId: string;
  let branchNearId: string;
  let branchFarId: string;
  let verifiedDoctorId: string;
  let pendingDoctorId: string;
  const createdUserIds: string[] = [];
  const createdAddressIds: string[] = [];

  async function createDoctor(params: { status: 'VERIFIED' | 'PENDING'; firstName: string }) {
    const user = await prisma.user.create({
      data: { phone: `+2010${suffix}${params.firstName.length}${Math.random().toString().slice(2, 6)}`, first_name: params.firstName, last_name: 'Test' },
    });
    createdUserIds.push(user.id);
    const doctor = await prisma.doctor.create({
      data: {
        user_id: user.id,
        specialty_code: specialtyCode,
        license_number: `LIC-${randomUUID()}`,
        status: params.status,
      },
    });
    return doctor.id;
  }

  beforeAll(async () => {
    await prisma.specialty.create({ data: { code: specialtyCode, name_en: 'Test Specialty', name_ar: 'تخصص اختبار' } });

    const clinic = await prisma.clinic.create({
      data: { legal_name: `Test Clinic ${suffix}`, brand_name: `Test Clinic ${suffix}`, status: 'VERIFIED' },
    });
    clinicId = clinic.id;

    const addressNear = await prisma.address.create({
      data: { line1: 'Near', city: 'Cairo', region_code: 'CAI', country_code: 'EG', geo_lat: NEAR.lat, geo_lng: NEAR.lng },
    });
    const addressFar = await prisma.address.create({
      data: { line1: 'Far', city: 'Alexandria', region_code: 'ALX', country_code: 'EG', geo_lat: FAR.lat, geo_lng: FAR.lng },
    });
    createdAddressIds.push(addressNear.id, addressFar.id);

    const branchNear = await prisma.clinicBranch.create({
      data: { clinic_id: clinicId, address_id: addressNear.id, phone: '+201', iana_timezone: 'Africa/Cairo', status: 'VERIFIED' },
    });
    branchNearId = branchNear.id;
    const branchFar = await prisma.clinicBranch.create({
      data: { clinic_id: clinicId, address_id: addressFar.id, phone: '+202', iana_timezone: 'Africa/Cairo', status: 'VERIFIED' },
    });
    branchFarId = branchFar.id;

    verifiedDoctorId = await createDoctor({ status: 'VERIFIED', firstName: 'Verified' });
    pendingDoctorId = await createDoctor({ status: 'PENDING', firstName: 'Pending' });

    await prisma.doctorClinicAffiliation.create({
      data: { doctor_id: verifiedDoctorId, clinic_branch_id: branchNearId, consult_fee: '100.00', currency: 'EGP' },
    });
    await prisma.doctorClinicAffiliation.create({
      data: { doctor_id: verifiedDoctorId, clinic_branch_id: branchFarId, consult_fee: '200.00', currency: 'EGP' },
    });
    await prisma.doctorClinicAffiliation.create({
      data: { doctor_id: pendingDoctorId, clinic_branch_id: branchNearId, consult_fee: '150.00', currency: 'EGP' },
    });
  }, 30000);

  afterAll(async () => {
    await prisma.doctorClinicAffiliation.deleteMany({ where: { doctor_id: { in: [verifiedDoctorId, pendingDoctorId] } } });
    await prisma.doctor.deleteMany({ where: { id: { in: [verifiedDoctorId, pendingDoctorId] } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.clinicBranch.deleteMany({ where: { clinic_id: clinicId } });
    await prisma.clinic.delete({ where: { id: clinicId } });
    await prisma.address.deleteMany({ where: { id: { in: createdAddressIds } } });
    await prisma.specialty.delete({ where: { code: specialtyCode } });
    await prisma.$disconnect();
  });

  it('excludes a PENDING doctor even though its affiliation/branch/clinic are all in good standing', async () => {
    const rows = await repository.search({
      specialtyCode,
      radiusKm: 15,
      sort: 'rating',
      sortDir: 'desc',
      limit: 20,
    });

    expect(rows.every((r) => r.doctor_id !== pendingDoctorId)).toBe(true);
    expect(rows.some((r) => r.doctor_id === verifiedDoctorId)).toBe(true);
  });

  it('filters by radius using PostGIS ST_DWithin', async () => {
    const rows = await repository.search({
      specialtyCode,
      lat: NEAR.lat,
      lng: NEAR.lng,
      radiusKm: 15,
      sort: 'distance',
      sortDir: 'asc',
      limit: 20,
    });

    const branchIds = rows.map((r) => r.clinic_branch_id);
    expect(branchIds).toContain(branchNearId);
    expect(branchIds).not.toContain(branchFarId);
  });

  it('computes distance_km and sorts ascending by it', async () => {
    const rows = await repository.search({
      specialtyCode,
      lat: NEAR.lat,
      lng: NEAR.lng,
      radiusKm: 500,
      sort: 'distance',
      sortDir: 'asc',
      limit: 20,
    });

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].distance_km).toBeLessThan(rows[rows.length - 1].distance_km ?? Infinity);
    // The "near" branch is essentially at the query point.
    expect(Number(rows[0].distance_km)).toBeLessThan(1);
  });

  it('paginates via the affiliation_id cursor without skipping or duplicating rows', async () => {
    const page1 = await repository.search({
      specialtyCode,
      sort: 'rating',
      sortDir: 'desc',
      radiusKm: 500,
      limit: 1,
    });
    expect(page1).toHaveLength(1);

    const page2 = await repository.search({
      specialtyCode,
      sort: 'rating',
      sortDir: 'desc',
      radiusKm: 500,
      limit: 1,
      cursor: { value: page1[0].sort_value, affiliationId: page1[0].affiliation_id },
    });

    expect(page2).toHaveLength(1);
    expect(page2[0].affiliation_id).not.toBe(page1[0].affiliation_id);
  });
});
