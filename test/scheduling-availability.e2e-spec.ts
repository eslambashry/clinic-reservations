import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GenerateSlotsUseCase } from '../src/modules/scheduling-appointments/application/generate-slots.use-case';
import { PrismaService } from '../src/shared/kernel/prisma/prisma.service';

/**
 * File 11 Part 26 "API contract"/"E2E" test types + this phase's exit
 * criterion (File 12 Part 10): real, correctly-timezoned slots via
 * `GET /doctors/{id}/slots`, generated from an Admin-created schedule
 * template, honoring the same visibility chain Phase 2 established.
 *
 * `GenerateSlotsUseCase` is invoked directly (Part 33.11 — no HTTP trigger
 * endpoint exists), the same shortcut the outbox worker's own drain loop
 * would need in a test without waiting on a real cron tick.
 */
describe('Scheduling Availability (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let generateSlots: GenerateSlotsUseCase;

  const suffix = randomUUID().slice(0, 8);
  const specialtyCode = `E2E_SCHED_SPECIALTY_${suffix}`;

  let adminUserId: string;
  let adminMembershipId: string;
  let patientUserId: string;
  let patientMembershipId: string;
  let adminToken: string;
  let patientToken: string;

  let clinicId: string;
  let branchId: string;
  let doctorId: string;
  let affiliationId: string;
  let scheduleTemplateId: string;

  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    generateSlots = app.get(GenerateSlotsUseCase);

    const adminUser = await prisma.user.create({ data: { phone: `+2012${suffix}0`, first_name: 'E2E', last_name: 'Admin' } });
    adminUserId = adminUser.id;
    createdUserIds.push(adminUserId);
    const adminMembership = await prisma.roleMembership.create({ data: { user_id: adminUserId, role_code: 'ADMIN', context_type: 'ADMIN' } });
    adminMembershipId = adminMembership.id;

    const patientUser = await prisma.user.create({ data: { phone: `+2012${suffix}1`, first_name: 'E2E', last_name: 'Patient' } });
    patientUserId = patientUser.id;
    createdUserIds.push(patientUserId);
    const patientMembership = await prisma.roleMembership.create({ data: { user_id: patientUserId, role_code: 'PATIENT', context_type: 'PATIENT' } });
    patientMembershipId = patientMembership.id;

    adminToken = jwt.sign({ sub: adminUserId, roleMembershipId: adminMembershipId, roleCode: 'ADMIN', contextType: 'ADMIN', permissions: [] });
    patientToken = jwt.sign({ sub: patientUserId, roleMembershipId: patientMembershipId, roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] });

    await prisma.specialty.create({ data: { code: specialtyCode, name_en: 'E2E Sched Specialty', name_ar: 'تخصص' } });

    const clinic = await prisma.clinic.create({ data: { legal_name: `E2E Sched Clinic ${suffix}`, brand_name: `E2E Sched Clinic ${suffix}`, status: 'VERIFIED' } });
    clinicId = clinic.id;

    const address = await prisma.address.create({ data: { line1: 'Test St', city: 'Cairo', region_code: 'CAI', country_code: 'EG' } });
    const branch = await prisma.clinicBranch.create({
      data: { clinic_id: clinicId, address_id: address.id, phone: '+201', iana_timezone: 'Africa/Cairo', status: 'VERIFIED' },
    });
    branchId = branch.id;

    const doctorUser = await prisma.user.create({ data: { phone: `+2012${suffix}2`, first_name: 'E2E', last_name: 'Doctor' } });
    createdUserIds.push(doctorUser.id);
    const doctor = await prisma.doctor.create({ data: { user_id: doctorUser.id, specialty_code: specialtyCode, license_number: `LIC-${suffix}` } });
    doctorId = doctor.id;

    const affiliation = await prisma.doctorClinicAffiliation.create({
      data: { doctor_id: doctorId, clinic_branch_id: branchId, consult_fee: '100.00', currency: 'EGP' },
    });
    affiliationId = affiliation.id;
  }, 30000);

  afterAll(async () => {
    await prisma.appointmentSlot.deleteMany({ where: { doctor_clinic_affiliation_id: affiliationId } });
    await prisma.scheduleTemplate.deleteMany({ where: { doctor_clinic_affiliation_id: affiliationId } });
    await prisma.auditLog.deleteMany({ where: { actor_user_id: { in: createdUserIds } } });
    await prisma.doctorClinicAffiliation.delete({ where: { id: affiliationId } });
    await prisma.doctor.delete({ where: { id: doctorId } });
    await prisma.clinicBranch.delete({ where: { id: branchId } });
    await prisma.clinic.delete({ where: { id: clinicId } });
    await prisma.roleMembership.deleteMany({ where: { user_id: { in: [adminUserId, patientUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.specialty.delete({ where: { code: specialtyCode } });
    await app.close();
  }, 30000);

  it('403s a non-Admin creating a schedule template', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/schedule-templates')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ doctorClinicAffiliationId: affiliationId, weekday: 1, startTime: '09:00', endTime: '13:00', slotDurationMinutes: 20 })
      .expect(403);

    expect(res.body.error.code).toBe('ROLE_NOT_PERMITTED');
  });

  it('Admin creates a schedule template', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/schedule-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ doctorClinicAffiliationId: affiliationId, weekday: 1, startTime: '09:00', endTime: '13:00', slotDurationMinutes: 20, bufferMinutes: 5 })
      .expect(201);

    expect(res.body.data.doctor_clinic_affiliation_id).toBe(affiliationId);
    scheduleTemplateId = res.body.data.id;
  });

  it('Admin can list schedule templates for the affiliation', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/schedule-templates')
      .query({ affiliationId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.some((t: any) => t.id === scheduleTemplateId)).toBe(true);
  });

  describe('before the doctor is verified', () => {
    it('generation produces no slots for a still-PENDING doctor', async () => {
      await generateSlots.execute();

      const count = await prisma.appointmentSlot.count({ where: { doctor_clinic_affiliation_id: affiliationId } });
      expect(count).toBe(0);
    });

    it('404s anonymous GET on the slots endpoint', async () => {
      await request(app.getHttpServer()).get(`/v1/doctors/${doctorId}/slots`).query({ clinicBranchId: branchId }).expect(404);
    });

    it('lets an Admin resolve the (empty) slots list via the same endpoint (@OptionalAuth)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/doctors/${doctorId}/slots`)
        .query({ clinicBranchId: branchId })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.slots).toEqual([]);
    });
  });

  describe('after the doctor is verified', () => {
    it('Admin verifies the doctor', async () => {
      await request(app.getHttpServer()).post(`/v1/doctors/${doctorId}/verify`).set('Authorization', `Bearer ${adminToken}`).expect(204);
    });

    it('generation now produces real slots for the newly-visible affiliation', async () => {
      await generateSlots.execute();

      const count = await prisma.appointmentSlot.count({ where: { doctor_clinic_affiliation_id: affiliationId } });
      expect(count).toBeGreaterThan(0);
    });

    it('anonymous GET now returns real, UTC, OPEN-only slots — the exit criterion', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/doctors/${doctorId}/slots`)
        .query({ clinicBranchId: branchId })
        .expect(200);

      const { slots } = res.body.data;
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        expect(slot.status).toBe('OPEN');
        expect(new Date(slot.endAt).getTime()).toBeGreaterThan(new Date(slot.startAt).getTime());
        expect(slot.startAt).toMatch(/Z$/); // UTC ISO-8601 (File 10 §2.3)
      }
    });

    it('400s an invalid date range (to before from)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/doctors/${doctorId}/slots`)
        .query({ clinicBranchId: branchId, from: '2026-03-10', to: '2026-03-09' })
        .expect(400);

      expect(res.body.error.code).toBe('INVALID_DATE_RANGE');
    });

    it('400s a date range spanning more than 14 days', async () => {
      await request(app.getHttpServer())
        .get(`/v1/doctors/${doctorId}/slots`)
        .query({ clinicBranchId: branchId, from: '2026-03-01', to: '2026-03-20' })
        .expect(400);
    });
  });

  it('Admin deletes the schedule template (stops future generation only, Part 33.8)', async () => {
    await request(app.getHttpServer())
      .delete(`/v1/schedule-templates/${scheduleTemplateId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    const res = await request(app.getHttpServer())
      .get('/v1/schedule-templates')
      .query({ affiliationId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data).toEqual([]);
  });
});
