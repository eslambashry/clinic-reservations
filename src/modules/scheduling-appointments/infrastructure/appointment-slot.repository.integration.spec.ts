import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { AppointmentSlotRepository } from './appointment-slot.repository';
import { ScheduleTemplateRepository } from './schedule-template.repository';
import { GenerateSlotsUseCase } from '../application/generate-slots.use-case';
import { ListSchedulableAffiliationsUseCase } from '../../provider-directory/application/list-schedulable-affiliations.use-case';
import { AffiliationRepository } from '../../provider-directory/infrastructure/affiliation.repository';

dotenv.config();

/**
 * File 11 Part 26 "Database" test type / File 12 Part 33: runs
 * `GenerateSlotsUseCase` end-to-end against a real Postgres (local
 * docker-compose, Part 32.17), exercising the whole cross-module path
 * (Part 33.3) rather than mocking `provider-directory`'s repository.
 */
describe('GenerateSlotsUseCase (integration)', () => {
  const prisma = new PrismaClient();
  const affiliations = new AffiliationRepository();
  const scheduleTemplates = new ScheduleTemplateRepository();
  const appointmentSlots = new AppointmentSlotRepository();
  const listSchedulableAffiliations = new ListSchedulableAffiliationsUseCase(prisma as any, affiliations);
  const generateSlots = new GenerateSlotsUseCase(prisma as any, scheduleTemplates, appointmentSlots, listSchedulableAffiliations);

  const suffix = randomUUID().slice(0, 8);
  const specialtyCode = `TEST_SPECIALTY_SCHED_${suffix}`;
  const TIMEZONE = 'Africa/Cairo';

  let clinicId: string;
  let branchId: string;
  let addressId: string;
  let verifiedAffiliationId: string;
  let pendingAffiliationId: string;
  const createdUserIds: string[] = [];
  const createdDoctorIds: string[] = [];

  async function createDoctor(status: 'VERIFIED' | 'PENDING', name: string) {
    const user = await prisma.user.create({
      data: { phone: `+2011${suffix}${Math.random().toString().slice(2, 6)}`, first_name: name, last_name: 'Test' },
    });
    createdUserIds.push(user.id);
    const doctor = await prisma.doctor.create({
      data: { user_id: user.id, specialty_code: specialtyCode, license_number: `LIC-${randomUUID()}`, status },
    });
    createdDoctorIds.push(doctor.id);
    return doctor.id;
  }

  beforeAll(async () => {
    await prisma.specialty.create({ data: { code: specialtyCode, name_en: 'Test Specialty', name_ar: 'تخصص اختبار' } });

    const clinic = await prisma.clinic.create({
      data: { legal_name: `Test Clinic ${suffix}`, brand_name: `Test Clinic ${suffix}`, status: 'VERIFIED' },
    });
    clinicId = clinic.id;

    const address = await prisma.address.create({ data: { line1: 'Test St', city: 'Cairo', region_code: 'CAI', country_code: 'EG' } });
    addressId = address.id;

    const branch = await prisma.clinicBranch.create({
      data: { clinic_id: clinicId, address_id: addressId, phone: '+201', iana_timezone: TIMEZONE, status: 'VERIFIED' },
    });
    branchId = branch.id;

    const verifiedDoctorId = await createDoctor('VERIFIED', 'Verified');
    const pendingDoctorId = await createDoctor('PENDING', 'Pending');

    const verifiedAffiliation = await prisma.doctorClinicAffiliation.create({
      data: { doctor_id: verifiedDoctorId, clinic_branch_id: branchId, consult_fee: '100.00', currency: 'EGP' },
    });
    verifiedAffiliationId = verifiedAffiliation.id;

    const pendingAffiliation = await prisma.doctorClinicAffiliation.create({
      data: { doctor_id: pendingDoctorId, clinic_branch_id: branchId, consult_fee: '100.00', currency: 'EGP' },
    });
    pendingAffiliationId = pendingAffiliation.id;

    // weekday=1..7 is guaranteed to occur at least once in any 30-day rolling window.
    await prisma.scheduleTemplate.create({
      data: { doctor_clinic_affiliation_id: verifiedAffiliationId, weekday: 1, start_time: '09:00', end_time: '10:00', slot_duration_minutes: 20, buffer_minutes: 5 },
    });
    await prisma.scheduleTemplate.create({
      data: { doctor_clinic_affiliation_id: pendingAffiliationId, weekday: 1, start_time: '09:00', end_time: '10:00', slot_duration_minutes: 20, buffer_minutes: 5 },
    });
  }, 30000);

  afterAll(async () => {
    await prisma.appointmentSlot.deleteMany({ where: { doctor_clinic_affiliation_id: { in: [verifiedAffiliationId, pendingAffiliationId] } } });
    await prisma.scheduleTemplate.deleteMany({ where: { doctor_clinic_affiliation_id: { in: [verifiedAffiliationId, pendingAffiliationId] } } });
    await prisma.doctorClinicAffiliation.deleteMany({ where: { id: { in: [verifiedAffiliationId, pendingAffiliationId] } } });
    await prisma.doctor.deleteMany({ where: { id: { in: createdDoctorIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.clinicBranch.delete({ where: { id: branchId } });
    await prisma.clinic.delete({ where: { id: clinicId } });
    await prisma.address.delete({ where: { id: addressId } });
    await prisma.specialty.delete({ where: { code: specialtyCode } });
    await prisma.$disconnect();
  });

  it('generates correctly-timezoned, buffer-spaced slots for a VERIFIED doctor and none for a PENDING one', async () => {
    await generateSlots.execute();

    const verifiedSlots = await prisma.appointmentSlot.findMany({
      where: { doctor_clinic_affiliation_id: verifiedAffiliationId },
      orderBy: { start_at: 'asc' },
    });
    expect(verifiedSlots.length).toBeGreaterThan(0);

    // Every generated slot round-trips to 09:00 or 09:25 local Africa/Cairo time (step = 20+5min, Part 33.7's trailing remainder dropped).
    const localStartTimes = new Set(verifiedSlots.map((s) => DateTime.fromJSDate(s.start_at, { zone: TIMEZONE }).toFormat('HH:mm')));
    expect(localStartTimes).toEqual(new Set(['09:00', '09:25']));
    for (const slot of verifiedSlots) {
      expect(DateTime.fromJSDate(slot.end_at).diff(DateTime.fromJSDate(slot.start_at), 'minutes').minutes).toBe(20);
    }

    const pendingSlots = await prisma.appointmentSlot.findMany({ where: { doctor_clinic_affiliation_id: pendingAffiliationId } });
    expect(pendingSlots).toHaveLength(0);
  });

  it('is idempotent — a second run does not duplicate slots (Part 33.8)', async () => {
    const before = await prisma.appointmentSlot.count({ where: { doctor_clinic_affiliation_id: verifiedAffiliationId } });

    await generateSlots.execute();

    const after = await prisma.appointmentSlot.count({ where: { doctor_clinic_affiliation_id: verifiedAffiliationId } });
    expect(after).toBe(before);
  });
});
