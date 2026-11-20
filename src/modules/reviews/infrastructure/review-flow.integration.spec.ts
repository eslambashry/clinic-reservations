import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { BusinessRuleError, ConflictError, DomainError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { DoctorRepository } from '../../provider-directory/infrastructure/doctor.repository';
import { AssertDoctorVisibleUseCase } from '../../provider-directory/application/assert-doctor-visible.use-case';
import { RecomputeDoctorRatingUseCase } from '../../provider-directory/application/recompute-doctor-rating.use-case';
import { GetAppointmentForReviewUseCase } from '../../scheduling-appointments/application/get-appointment-for-review.use-case';
import { AppointmentRepository } from '../../scheduling-appointments/infrastructure/appointment.repository';
import { ListAdminReviewsUseCase, SetReviewVisibilityUseCase } from '../application/admin-reviews.use-cases';
import { CreateReviewUseCase } from '../application/create-review.use-case';
import { ListDoctorReviewsUseCase } from '../application/list-doctor-reviews.use-case';
import { ReviewRepository } from './review.repository';

/** Real PostgreSQL: the whole review lifecycle against real appointments, doctors and the unique/aggregate invariants. */
describe('doctor reviews flow (real PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  const suffix = randomUUID();
  const actor = (sub: string) => ({ sub, roleMembershipId: 'm', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] }) as any;

  let specialtyCode: string;
  let addressId: string;
  let clinicId: string;
  let branchId: string;
  let doctorId: string;
  let doctorUserId: string;
  let affiliationId: string;
  const patientIds: string[] = [];
  const appointmentIds: string[] = [];
  const slotIds: string[] = [];

  const reviews = new ReviewRepository();
  const create = new CreateReviewUseCase(
    prisma as any,
    reviews,
    new GetAppointmentForReviewUseCase(prisma as any, new AppointmentRepository()),
    new RecomputeDoctorRatingUseCase(new DoctorRepository()),
    new OutboxService(),
  );
  const visibility = new SetReviewVisibilityUseCase(prisma as any, reviews, new RecomputeDoctorRatingUseCase(new DoctorRepository()));
  const listAdmin = new ListAdminReviewsUseCase(prisma as any, reviews);
  const listPublic = new ListDoctorReviewsUseCase(prisma as any, reviews, null as any, new AssertDoctorVisibleUseCase(prisma as any, new DoctorRepository()));

  async function newPatient(firstName: string): Promise<string> {
    const user = await prisma.user.create({ data: { phone: `fixture-review-${suffix}-${patientIds.length}`, first_name: firstName, last_name: 'Tester' } });
    patientIds.push(user.id);
    return user.id;
  }

  async function newAppointment(patientId: string, status: 'COMPLETED' | 'CONFIRMED'): Promise<string> {
    const start = new Date(Date.UTC(2026, 0, 1, 9 + slotIds.length));
    const slot = await prisma.appointmentSlot.create({
      data: { doctor_clinic_affiliation_id: affiliationId, start_at: start, end_at: new Date(start.getTime() + 20 * 60000), status: 'BOOKED' },
    });
    slotIds.push(slot.id);
    const appointment = await prisma.appointment.create({
      data: { slot_id: slot.id, patient_id: patientId, doctor_clinic_affiliation_id: affiliationId, status, visit_status: status === 'COMPLETED' ? 'LEFT' : 'WAITING' },
    });
    appointmentIds.push(appointment.id);
    return appointment.id;
  }

  async function doctorRating() {
    const doctor = await prisma.doctor.findUniqueOrThrow({ where: { id: doctorId } });
    return { avg: Number(doctor.rating_avg), count: doctor.rating_count };
  }

  beforeAll(async () => {
    specialtyCode = (await prisma.specialty.create({ data: { name_ar: `تخصص تقييمات ${suffix}` } })).code;
    addressId = (await prisma.address.create({ data: { line1: 'Review fixture', city: 'Cairo', region_code: 'CAI', country_code: 'EG' } })).id;
    clinicId = (await prisma.clinic.create({ data: { legal_name: `Review ${suffix}`, brand_name: 'Review fixture', status: 'VERIFIED' } })).id;
    branchId = (await prisma.clinicBranch.create({ data: { clinic_id: clinicId, address_id: addressId, phone: '+201000000000', iana_timezone: 'Africa/Cairo', status: 'VERIFIED' } })).id;
    doctorUserId = (await prisma.user.create({ data: { phone: `fixture-review-doctor-${suffix}`, first_name: 'Doc', last_name: 'Tor' } })).id;
    doctorId = (await prisma.doctor.create({ data: { user_id: doctorUserId, specialty_code: specialtyCode, license_number: `LIC-${suffix}`, status: 'VERIFIED' } })).id;
    affiliationId = (await prisma.doctorClinicAffiliation.create({ data: { doctor_id: doctorId, clinic_branch_id: branchId, consult_fee: 100, currency: 'EGP' } })).id;
  });

  afterAll(async () => {
    await prisma.review.deleteMany({ where: { subject_id: doctorId } });
    await prisma.outboxEvent.deleteMany({ where: { event_name: 'DoctorReviewed', payload: { path: ['doctorUserId'], equals: doctorUserId } } });
    await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
    await prisma.appointmentSlot.deleteMany({ where: { id: { in: slotIds } } });
    await prisma.doctorClinicAffiliation.deleteMany({ where: { id: affiliationId } });
    await prisma.doctor.deleteMany({ where: { id: doctorId } });
    await prisma.clinicBranch.deleteMany({ where: { id: branchId } });
    await prisma.clinic.deleteMany({ where: { id: clinicId } });
    await prisma.address.deleteMany({ where: { id: addressId } });
    await prisma.user.deleteMany({ where: { id: { in: [...patientIds, doctorUserId] } } });
    await prisma.specialty.deleteMany({ where: { code: specialtyCode } });
    await prisma.$disconnect();
  });

  it('rejects a review before the visit is COMPLETED and writes nothing', async () => {
    const patient = await newPatient('Early');
    const appointmentId = await newAppointment(patient, 'CONFIRMED');

    await expect(create.execute({ appointmentId, rating: 5 }, actor(patient))).rejects.toBeInstanceOf(BusinessRuleError);
    expect(await prisma.review.count({ where: { appointment_id: appointmentId } })).toBe(0);
    expect(await doctorRating()).toEqual({ avg: 0, count: 0 });
  });

  it("404s on another patient's appointment", async () => {
    const owner = await newPatient('Owner');
    const stranger = await newPatient('Stranger');
    const appointmentId = await newAppointment(owner, 'COMPLETED');

    await expect(create.execute({ appointmentId, rating: 5 }, actor(stranger))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('creates reviews, keeps one per appointment, and maintains the doctor aggregate + outbox event', async () => {
    const first = await newPatient('Mona');
    const second = await newPatient('Omar');
    const firstAppointment = await newAppointment(first, 'COMPLETED');
    const secondAppointment = await newAppointment(second, 'COMPLETED');

    const created = await create.execute({ appointmentId: firstAppointment, rating: 5, comment: 'ممتاز' }, actor(first));
    expect(created.rating).toBe(5);
    expect(await doctorRating()).toEqual({ avg: 5, count: 1 });

    await expect(create.execute({ appointmentId: firstAppointment, rating: 1 }, actor(first))).rejects.toBeInstanceOf(ConflictError);
    expect(await doctorRating()).toEqual({ avg: 5, count: 1 });

    await create.execute({ appointmentId: secondAppointment, rating: 4 }, actor(second));
    expect(await doctorRating()).toEqual({ avg: 4.5, count: 2 });

    const events = await prisma.outboxEvent.count({ where: { event_name: 'DoctorReviewed', payload: { path: ['doctorUserId'], equals: doctorUserId } } });
    expect(events).toBe(2);
  });

  it('survives two concurrent submits for the same appointment: exactly one review, aggregate counts it once', async () => {
    const patient = await newPatient('Race');
    const appointmentId = await newAppointment(patient, 'COMPLETED');
    const before = await doctorRating();

    const results = await Promise.allSettled([
      create.execute({ appointmentId, rating: 3 }, actor(patient)),
      create.execute({ appointmentId, rating: 3 }, actor(patient)),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await prisma.review.count({ where: { appointment_id: appointmentId } })).toBe(1);
    expect((await doctorRating()).count).toBe(before.count + 1);
  });

  it('lists published reviews with first names only and the star distribution; hide/unhide updates list and aggregate', async () => {
    const publicView = await listPublic.execute(doctorId, {}, undefined);
    expect(publicView.summary.count).toBe((await doctorRating()).count);
    expect(publicView.items.every((item) => !item.patientName.includes('Tester'))).toBe(true);
    expect(publicView.summary.distribution[5]).toBeGreaterThanOrEqual(1);

    const target = publicView.items.find((item) => item.rating === 5)!;
    const before = await doctorRating();

    await visibility.execute(target.id, true);
    const afterHide = await doctorRating();
    expect(afterHide.count).toBe(before.count - 1);
    expect((await listPublic.execute(doctorId, {}, undefined)).items.some((item) => item.id === target.id)).toBe(false);
    const hiddenForAdmin = await listAdmin.execute({ doctorId, status: 'HIDDEN' });
    expect(hiddenForAdmin.items.map((item) => item.id)).toContain(target.id);
    expect(hiddenForAdmin.items[0].patientFullName).toContain('Tester');

    await visibility.execute(target.id, false);
    expect(await doctorRating()).toEqual(before);
  });

  it('pages a doctor review list with a cursor without repeating or skipping rows', async () => {
    const total = (await doctorRating()).count;
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listPublic.execute(doctorId, { cursor, limit: 2 }, undefined);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
  });

  it('rejects a malformed cursor with a 400 instead of a 500', async () => {
    for (const bad of ['e30', Buffer.from('5').toString('base64url'), Buffer.from(JSON.stringify({ c: 'x', i: 'y' })).toString('base64url')]) {
      await expect(listPublic.execute(doctorId, { cursor: bad }, undefined)).rejects.toMatchObject({ httpStatus: 400 });
    }
    await expect(listPublic.execute(doctorId, { cursor: 'e30' }, undefined)).rejects.toBeInstanceOf(DomainError);
  });

  it('exposes nothing for a doctor hidden from the directory (404 publicly, readable by Admin); hide still works for a soft-deleted doctor', async () => {
    const reviewId = (await prisma.review.findFirstOrThrow({ where: { subject_id: doctorId, status: 'PUBLISHED' } })).id;

    await prisma.doctor.update({ where: { id: doctorId }, data: { status: 'SUSPENDED' } });
    await expect(listPublic.execute(doctorId, {}, undefined)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listPublic.execute(doctorId, {}, 'PATIENT')).rejects.toBeInstanceOf(NotFoundError);
    await expect(listPublic.execute(doctorId, {}, 'ADMIN')).resolves.toBeDefined();

    await prisma.doctor.update({ where: { id: doctorId }, data: { status: 'VERIFIED', deleted_at: new Date() } });
    await expect(listPublic.execute(doctorId, {}, undefined)).rejects.toBeInstanceOf(NotFoundError);
    await expect(visibility.execute(reviewId, true)).resolves.toEqual({ id: reviewId, status: 'HIDDEN' });
    await visibility.execute(reviewId, false);

    await prisma.doctor.update({ where: { id: doctorId }, data: { deleted_at: null } });
  });

  it('does not lose rows when many reviews share a millisecond', async () => {
    const ids: string[] = [];
    const sameInstant = new Date();
    for (let n = 0; n < 5; n++) {
      const patient = await newPatient(`Tie${n}`);
      const appointmentId = await newAppointment(patient, 'COMPLETED');
      const row = await prisma.review.create({
        data: { patient_id: patient, subject_type: 'DOCTOR', subject_id: doctorId, appointment_id: appointmentId, rating: 4, created_at: sameInstant },
      });
      ids.push(row.id);
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listPublic.execute(doctorId, { cursor, limit: 2 }, undefined);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    for (const id of ids) {
      expect(seen).toContain(id);
    }
    expect(new Set(seen).size).toBe(seen.length);
  });
});
