import { DoctorStatus, Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AssertDoctorPrescribingEligibilityUseCase } from '../application/assert-doctor-prescribing-eligibility.use-case';
import { ResolveDoctorScopeUseCase } from '../application/resolve-doctor-scope.use-case';
import { DoctorRepository } from './doctor.repository';
import { AffiliationRepository } from './affiliation.repository';
import { ClinicStaffAssignmentRepository } from './clinic-staff-assignment.repository';

function signal<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Actual SQL eligibility boundary; the create/approval callers are covered by their owning unit tests. */
describe('physician prescribing eligibility (real PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  const doctors = new DoctorRepository();
  const eligibility = new AssertDoctorPrescribingEligibilityUseCase(doctors);
  const suffix = randomUUID();
  let doctorId: string;
  let doctorUserId: string;
  let patientId: string;
  let specialtyCode: string;

  beforeAll(async () => {
    const specialty = await prisma.specialty.create({ data: { name_ar: 'تخصص اختبار أهلية الطبيب' } });
    specialtyCode = specialty.code;
    const user = await prisma.user.create({ data: { phone: `fixture-doctor-${suffix}` } });
    doctorUserId = user.id;
    const patient = await prisma.user.create({ data: { phone: `fixture-patient-${suffix}` } });
    patientId = patient.id;
    const doctor = await prisma.doctor.create({ data: { user_id: doctorUserId, specialty_code: specialtyCode, license_number: `fixture-${suffix}`, status: 'VERIFIED' } });
    doctorId = doctor.id;
  });

  beforeEach(async () => {
    await prisma.prescription.deleteMany({ where: { doctor_id: doctorUserId } });
    await prisma.doctor.update({ where: { id: doctorId }, data: { status: 'VERIFIED', deleted_at: null } });
  });

  afterAll(async () => {
    if (doctorUserId) await prisma.prescription.deleteMany({ where: { doctor_id: doctorUserId } });
    if (doctorId) await prisma.doctor.delete({ where: { id: doctorId } });
    await prisma.user.deleteMany({ where: { id: { in: [doctorUserId, patientId].filter(Boolean) } } });
    if (specialtyCode) await prisma.specialty.delete({ where: { code: specialtyCode } });
    await prisma.$disconnect();
  });

  async function sign(tx: Prisma.TransactionClient) {
    await eligibility.execute(tx, doctorId);
    return tx.prescription.create({ data: { patient_id: patientId, doctor_id: doctorUserId, source: 'DOCTOR_ISSUED', status: 'ACCEPTED' } });
  }

  async function status(tx: Prisma.TransactionClient, next: 'VERIFIED' | 'SUSPENDED') {
    const doctor = await doctors.findById(tx, doctorId);
    await doctors.setStatus(tx, doctorId, doctor!.version, next);
  }

  async function waitForBlocking(pid: number) {
    for (let attempt = 0; attempt < 150; attempt++) {
      const rows = await prisma.$queryRaw<{ blockers: number }[]>`SELECT cardinality(pg_blocking_pids(${pid}::integer)) AS blockers`;
      if (rows[0].blockers > 0) return;
      await new Promise((done) => setTimeout(done, 10));
    }
    throw new Error('The clinical/status write did not block on the doctor row lock');
  }

  async function backendPid(tx: Prisma.TransactionClient) {
    const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    return rows[0].pid;
  }

  it.each(['PENDING', 'REJECTED', 'SUSPENDED'] as DoctorStatus[])('rejects %s before a clinical write', async (next) => {
    await prisma.doctor.update({ where: { id: doctorId }, data: { status: next } });
    await expect(prisma.$transaction(sign)).rejects.toMatchObject({ code: 'DOCTOR_NOT_ELIGIBLE_TO_PRESCRIBE', httpStatus: 422 });
    expect(await prisma.prescription.count({ where: { doctor_id: doctorUserId } })).toBe(0);
  });

  it('rejects a soft-deleted physician even when the retained status is VERIFIED', async () => {
    await prisma.doctor.update({ where: { id: doctorId }, data: { deleted_at: new Date() } });
    await expect(prisma.$transaction(sign)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', httpStatus: 404 });
    expect(await prisma.prescription.count({ where: { doctor_id: doctorUserId } })).toBe(0);
  });

  it('allows VERIFIED signing and preserves suspended ownership/history access', async () => {
    const prescription = await prisma.$transaction(sign);
    await prisma.$transaction((tx) => status(tx, 'SUSPENDED'));
    const scope = new ResolveDoctorScopeUseCase(prisma as any, doctors, new AffiliationRepository(), new ClinicStaffAssignmentRepository());
    await expect(scope.execute({ sub: doctorUserId, roleMembershipId: randomUUID(), roleCode: 'DOCTOR', contextType: 'DOCTOR', permissions: [] }))
      .resolves.toMatchObject({ doctorId, doctorUserId, affiliationIds: [] });
    expect(await prisma.prescription.findUnique({ where: { id: prescription.id } })).toMatchObject({ status: 'ACCEPTED' });
    await expect(prisma.$transaction(sign)).rejects.toMatchObject({ code: 'DOCTOR_NOT_ELIGIBLE_TO_PRESCRIBE' });
  });

  it.each(['SUSPENDED', 'VERIFIED'] as const)('observes committed %s when the administrator acquires the row first', async (next) => {
    if (next === 'VERIFIED') await prisma.doctor.update({ where: { id: doctorId }, data: { status: 'PENDING' } });
    const held = signal();
    const release = signal();
    const started = signal<number>();
    const administrative = prisma.$transaction(async (tx) => {
      await status(tx, next);
      held.resolve();
      await release.promise;
    }, { timeout: 10000 });
    await held.promise;
    const clinical = prisma.$transaction(async (tx) => {
      started.resolve(await backendPid(tx));
      return sign(tx);
    }, { timeout: 10000 }).then((value) => ({ value, error: null }), (error: unknown) => ({ value: null, error }));
    try {
      await waitForBlocking(await started.promise);
    } finally {
      release.resolve();
      await administrative;
    }
    const result = await clinical;
    if (next === 'SUSPENDED') {
      expect(result.error).toMatchObject({ code: 'DOCTOR_NOT_ELIGIBLE_TO_PRESCRIBE' });
      expect(await prisma.prescription.count({ where: { doctor_id: doctorUserId } })).toBe(0);
    } else {
      expect(result.error).toBeNull();
      expect(result.value).toMatchObject({ status: 'ACCEPTED' });
      expect(await prisma.prescription.count({ where: { doctor_id: doctorUserId } })).toBe(1);
    }
  });

  it('a clinical transaction holding the physician lock commits before a later suspension', async () => {
    const held = signal();
    const release = signal();
    const administrativePid = signal<number>();
    let administrativeCommitted = false;
    const clinical = prisma.$transaction(async (tx) => {
      await eligibility.execute(tx, doctorId);
      held.resolve();
      await release.promise;
      return tx.prescription.create({ data: { patient_id: patientId, doctor_id: doctorUserId, source: 'DOCTOR_ISSUED', status: 'ACCEPTED' } });
    }, { timeout: 10000 });
    await held.promise;
    const administrative = prisma.$transaction(async (tx) => {
      administrativePid.resolve(await backendPid(tx));
      await status(tx, 'SUSPENDED');
    }, { timeout: 10000 }).then(() => { administrativeCommitted = true; });
    try {
      await waitForBlocking(await administrativePid.promise);
      expect(administrativeCommitted).toBe(false);
    } finally {
      release.resolve();
      await Promise.all([clinical, administrative]);
    }
    expect((await prisma.doctor.findUnique({ where: { id: doctorId } }))?.status).toBe('SUSPENDED');
    expect(await prisma.prescription.count({ where: { doctor_id: doctorUserId, status: 'ACCEPTED' } })).toBe(1);
    await expect(prisma.$transaction(sign)).rejects.toMatchObject({ code: 'DOCTOR_NOT_ELIGIBLE_TO_PRESCRIBE' });
  });
});
