import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/kernel/prisma/prisma.service';

/**
 * Doctor Dashboard end-to-end (File 12 Part 49) — the full HTTP journey the
 * Flutter `provider_dashboard` feature actually makes, against a real
 * Postgres: profile, clinics/branches, schedule templates, and the
 * appointment queue including provider-initiated cancel and reschedule.
 *
 * Two doctors (A and B) exist throughout, at two different clinics, so every
 * ownership assertion is a real cross-tenant attempt rather than a missing
 * row. A patient and an admin exist too, to prove the pre-existing surfaces
 * did not regress and that role gating still holds.
 *
 * The global `ValidationPipe`/`ResponseInterceptor`/`ErrorEnvelopeFilter`
 * come from `CoreModule` via `APP_PIPE`/`APP_INTERCEPTOR`/`APP_FILTER`, so
 * booting `AppModule` alone exercises the real envelopes — assertions below
 * check `body.success`/`body.data` rather than a bare payload.
 */
describe('Doctor Dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const suffix = randomUUID().slice(0, 8);
  const numericSuffix = (Date.now() % 100000000).toString().padStart(8, '0');
  const specialtyCode = `E2E_DASH_SPECIALTY_${suffix}`;

  const createdUserIds: string[] = [];

  let doctorAUserId: string;
  let doctorAId: string;
  let doctorAToken: string;
  let doctorBUserId: string;
  let doctorBId: string;
  let doctorBToken: string;
  let patientUserId: string;
  let patientToken: string;
  let adminToken: string;

  let clinicAId: string;
  let branchAId: string;
  let addressAId: string;
  let affiliationAId: string;
  let clinicBId: string;
  let branchBId: string;
  let affiliationBId: string;

  const server = () => app.getHttpServer();

  async function freshOpenSlot(affiliationId: string, startAt: Date): Promise<{ id: string }> {
    return prisma.appointmentSlot.create({
      data: {
        doctor_clinic_affiliation_id: affiliationId,
        start_at: startAt,
        end_at: new Date(startAt.getTime() + 30 * 60 * 1000),
        status: 'OPEN',
      },
      select: { id: true },
    });
  }

  /** Books a real appointment through the patient's own hold -> confirm path. */
  async function bookConfirmedAppointment(affiliationId: string, startAt: Date): Promise<{ appointmentId: string; slotId: string }> {
    const slot = await freshOpenSlot(affiliationId, startAt);

    const held = await request(server())
      .post('/v1/appointments/hold')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ doctorClinicAffiliationId: affiliationId, slotId: slot.id, patientId: patientUserId })
      .expect(201);

    const confirmed = await request(server())
      .post(`/v1/appointments/${held.body.data.holdId}/confirm`)
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ paymentMethod: 'PAY_AT_CLINIC' })
      .expect(200);

    return { appointmentId: confirmed.body.data.appointmentId, slotId: slot.id };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);

    await prisma.specialty.create({ data: { code: specialtyCode, name_en: 'E2E Dashboard Specialty', name_ar: 'تخصص' } });

    // --- Clinic A / Doctor A ---
    const clinicA = await prisma.clinic.create({
      data: { legal_name: `E2E Dash Clinic A ${suffix}`, brand_name: `Dash Clinic A ${suffix}`, tax_id: 'TAX-A', status: 'VERIFIED' },
    });
    clinicAId = clinicA.id;
    const addressA = await prisma.address.create({ data: { line1: '12 Tahrir St', city: 'Cairo', region_code: 'CAI', country_code: 'EG' } });
    addressAId = addressA.id;
    const branchA = await prisma.clinicBranch.create({
      data: { clinic_id: clinicAId, address_id: addressAId, phone: '+20200000001', iana_timezone: 'Africa/Cairo', status: 'VERIFIED' },
    });
    branchAId = branchA.id;

    const doctorAUser = await prisma.user.create({
      data: { phone: `+2012${numericSuffix}1`, first_name: 'Amr', last_name: 'Adel', email: `doctor.a.${suffix}@example.com` },
    });
    doctorAUserId = doctorAUser.id;
    createdUserIds.push(doctorAUserId);
    const doctorA = await prisma.doctor.create({
      data: { user_id: doctorAUserId, specialty_code: specialtyCode, license_number: `LIC-A-${suffix}`, status: 'VERIFIED' },
    });
    doctorAId = doctorA.id;
    const affiliationA = await prisma.doctorClinicAffiliation.create({
      data: { doctor_id: doctorAId, clinic_branch_id: branchAId, consult_fee: '250.00', currency: 'EGP' },
    });
    affiliationAId = affiliationA.id;

    // --- Clinic B / Doctor B ---
    const clinicB = await prisma.clinic.create({
      data: { legal_name: `E2E Dash Clinic B ${suffix}`, brand_name: `Dash Clinic B ${suffix}`, status: 'VERIFIED' },
    });
    clinicBId = clinicB.id;
    const addressB = await prisma.address.create({ data: { line1: '5 Corniche', city: 'Alexandria', region_code: 'ALX', country_code: 'EG' } });
    const branchB = await prisma.clinicBranch.create({
      data: { clinic_id: clinicBId, address_id: addressB.id, phone: '+20200000002', iana_timezone: 'Africa/Cairo', status: 'VERIFIED' },
    });
    branchBId = branchB.id;

    const doctorBUser = await prisma.user.create({ data: { phone: `+2012${numericSuffix}2`, first_name: 'Nour', last_name: 'Fahmy' } });
    doctorBUserId = doctorBUser.id;
    createdUserIds.push(doctorBUserId);
    const doctorB = await prisma.doctor.create({
      data: { user_id: doctorBUserId, specialty_code: specialtyCode, license_number: `LIC-B-${suffix}`, status: 'VERIFIED' },
    });
    doctorBId = doctorB.id;
    const affiliationB = await prisma.doctorClinicAffiliation.create({
      data: { doctor_id: doctorBId, clinic_branch_id: branchBId, consult_fee: '300.00', currency: 'EGP' },
    });
    affiliationBId = affiliationB.id;

    // --- Patient + Admin ---
    const patientUser = await prisma.user.create({ data: { phone: `+2012${numericSuffix}3`, first_name: 'Mona', last_name: 'Hassan' } });
    patientUserId = patientUser.id;
    createdUserIds.push(patientUserId);
    const adminUser = await prisma.user.create({ data: { phone: `+2012${numericSuffix}4`, first_name: 'Ops', last_name: 'Admin' } });
    createdUserIds.push(adminUser.id);

    const [doctorAMembership, doctorBMembership, patientMembership, adminMembership] = await Promise.all([
      prisma.roleMembership.create({ data: { user_id: doctorAUserId, role_code: 'DOCTOR', context_type: 'DOCTOR' } }),
      prisma.roleMembership.create({ data: { user_id: doctorBUserId, role_code: 'DOCTOR', context_type: 'DOCTOR' } }),
      prisma.roleMembership.create({ data: { user_id: patientUserId, role_code: 'PATIENT', context_type: 'PATIENT' } }),
      prisma.roleMembership.create({ data: { user_id: adminUser.id, role_code: 'ADMIN', context_type: 'ADMIN' } }),
    ]);

    const sign = (sub: string, membershipId: string, role: string) =>
      jwt.sign({ sub, roleMembershipId: membershipId, roleCode: role, contextType: role, permissions: [] });

    doctorAToken = sign(doctorAUserId, doctorAMembership.id, 'DOCTOR');
    doctorBToken = sign(doctorBUserId, doctorBMembership.id, 'DOCTOR');
    patientToken = sign(patientUserId, patientMembership.id, 'PATIENT');
    adminToken = sign(adminUser.id, adminMembership.id, 'ADMIN');
  }, 60000);

  afterAll(async () => {
    const affiliationIds = [affiliationAId, affiliationBId].filter(Boolean);
    const appointments = await prisma.appointment.findMany({
      where: { doctor_clinic_affiliation_id: { in: affiliationIds } },
      select: { id: true, payment_intent_id: true },
    });
    const paymentIntentIds = appointments.map((a) => a.payment_intent_id).filter((id): id is string => !!id);

    await prisma.appointmentHold.deleteMany({ where: { slot: { doctor_clinic_affiliation_id: { in: affiliationIds } } } });
    await prisma.appointment.updateMany({
      where: { doctor_clinic_affiliation_id: { in: affiliationIds } },
      data: { payment_intent_id: null, rescheduled_from_appointment_id: null },
    });
    await prisma.refund.deleteMany({ where: { payment_intent_id: { in: paymentIntentIds } } });
    await prisma.paymentSplit.deleteMany({ where: { payment_intent_id: { in: paymentIntentIds } } });
    await prisma.providerLedgerEntry.deleteMany({ where: { related_payment_intent_id: { in: paymentIntentIds } } });
    await prisma.appointment.deleteMany({ where: { doctor_clinic_affiliation_id: { in: affiliationIds } } });
    await prisma.paymentIntent.deleteMany({ where: { id: { in: paymentIntentIds } } });
    await prisma.appointmentSlot.deleteMany({ where: { doctor_clinic_affiliation_id: { in: affiliationIds } } });
    await prisma.scheduleTemplate.deleteMany({ where: { doctor_clinic_affiliation_id: { in: affiliationIds } } });
    await prisma.outboxEvent.deleteMany({ where: { created_at: { gte: new Date(Date.now() - 1000 * 60 * 60) }, event_name: { startsWith: 'Appointment' } } });
    await prisma.auditLog.deleteMany({ where: { actor_user_id: { in: createdUserIds } } });
    await prisma.doctorClinicAffiliation.deleteMany({ where: { id: { in: affiliationIds } } });
    await prisma.doctor.deleteMany({ where: { id: { in: [doctorAId, doctorBId] } } });
    await prisma.clinicBranch.deleteMany({ where: { id: { in: [branchAId, branchBId] } } });
    await prisma.clinic.deleteMany({ where: { id: { in: [clinicAId, clinicBId] } } });
    await prisma.roleMembership.deleteMany({ where: { user_id: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.specialty.delete({ where: { code: specialtyCode } });
    await app.close();
  }, 60000);

  describe('authentication and role gating', () => {
    it.each([
      ['/v1/doctors/me/clinics'],
      ['/v1/doctors/me/schedule-templates'],
      ['/v1/doctors/me/appointments'],
    ])('401s an anonymous request to %s, in the standard error envelope', async (path) => {
      const response = await request(server()).get(path).expect(401);

      expect(response.body).toMatchObject({ success: false, error: { code: 'UNAUTHENTICATED' } });
      expect(response.body.error).toHaveProperty('requestId');
      expect(response.body.error).toHaveProperty('correlationId');
    });

    it.each([
      ['/v1/doctors/me/clinics'],
      ['/v1/doctors/me/schedule-templates'],
      ['/v1/doctors/me/appointments'],
    ])('403s a PATIENT-context token on %s', async (path) => {
      const response = await request(server()).get(path).set('Authorization', `Bearer ${patientToken}`).expect(403);

      expect(response.body).toMatchObject({ success: false, error: { code: 'ROLE_NOT_PERMITTED' } });
    });

    it('403s an ADMIN token on the doctor-scoped surface — these routes are DOCTOR-only, not "staff-or-above"', async () => {
      await request(server()).get('/v1/doctors/me/clinics').set('Authorization', `Bearer ${adminToken}`).expect(403);
    });
  });

  describe('1. profile', () => {
    it('reads the authenticated doctor’s own profile, including the licenseNumber the public route omits', async () => {
      const response = await request(server()).get('/v1/doctors/me').set('Authorization', `Bearer ${doctorAToken}`).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: doctorAId,
        displayName: 'Amr Adel',
        licenseNumber: `LIC-A-${suffix}`,
        specialtyKey: specialtyCode,
        isVerified: true,
      });
    });

    it('updates the editable fields and returns the refreshed profile', async () => {
      const response = await request(server())
        .patch('/v1/doctors/me')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ bio: 'Cardiologist, 12 years', degree: 'MBBCh, MD', experienceYears: 12 })
        .expect(200);

      expect(response.body.data).toMatchObject({ bio: 'Cardiologist, 12 years', degree: 'MBBCh, MD', experienceYears: 12 });
    });

    it('writes an audit row for the self-edit (File 12 Part 49.1)', async () => {
      const logs = await prisma.auditLog.findMany({
        where: { actor_user_id: doctorAUserId, action: 'provider_directory.doctor.update_self', resource_id: doctorAId },
      });

      expect(logs.length).toBeGreaterThan(0);
    });

    it('400s an attempt to change licence, specialty or verification through the self-edit route', async () => {
      await request(server())
        .patch('/v1/doctors/me')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ licenseNumber: 'FORGED-LICENCE' })
        .expect(400);

      await request(server())
        .patch('/v1/doctors/me')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ specialtyCode: 'ANY', status: 'VERIFIED' })
        .expect(400);

      const doctor = await prisma.doctor.findUniqueOrThrow({ where: { id: doctorAId } });
      expect(doctor.license_number).toBe(`LIC-A-${suffix}`);
      expect(doctor.specialty_code).toBe(specialtyCode);
    });

    it('updates the account name/email through the shared /v1/auth/me endpoint', async () => {
      const response = await request(server())
        .patch('/v1/auth/me')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ email: `doctor.a.updated.${suffix}@example.com` })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('2. clinics and branches', () => {
    it('lists the doctor’s own clinics and branches with the operational fields the dashboard renders', async () => {
      const response = await request(server()).get('/v1/doctors/me/clinics').set('Authorization', `Bearer ${doctorAToken}`).expect(200);

      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0]).toMatchObject({
        affiliationId: affiliationAId,
        affiliationStatus: 'ACTIVE',
        clinicId: clinicAId,
        clinicName: `Dash Clinic A ${suffix}`,
        clinicStatus: 'VERIFIED',
        clinicBranchId: branchAId,
        branchStatus: 'VERIFIED',
        phone: '+20200000001',
        ianaTimezone: 'Africa/Cairo',
        address: { line1: '12 Tahrir St', city: 'Cairo', regionCode: 'CAI', countryCode: 'EG' },
      });
    });

    it('never exposes sensitive/legal clinic data on the doctor surface', async () => {
      const response = await request(server()).get('/v1/doctors/me/clinics').set('Authorization', `Bearer ${doctorAToken}`).expect(200);

      const item = response.body.data.items[0];
      expect(item).not.toHaveProperty('legalName');
      expect(item).not.toHaveProperty('taxId');
      expect(JSON.stringify(item)).not.toContain('TAX-A');
    });

    it('does not leak another doctor’s clinic into the list', async () => {
      const response = await request(server()).get('/v1/doctors/me/clinics').set('Authorization', `Bearer ${doctorBToken}`).expect(200);

      expect(response.body.data.items.map((item: { clinicBranchId: string }) => item.clinicBranchId)).toEqual([branchBId]);
    });

    it('updates an associated branch and returns the refreshed row', async () => {
      const response = await request(server())
        .patch(`/v1/doctors/me/clinics/branches/${branchAId}`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ phone: '+20211111111', address: { line1: '99 New Cairo Rd' } })
        .expect(200);

      expect(response.body.data).toMatchObject({ clinicBranchId: branchAId, phone: '+20211111111', address: { line1: '99 New Cairo Rd', city: 'Cairo' } });

      const branch = await prisma.clinicBranch.findUniqueOrThrow({ where: { id: branchAId } });
      expect(branch.phone).toBe('+20211111111');
    });

    it('audits every branch update, naming the acting doctor', async () => {
      const logs = await prisma.auditLog.findMany({
        where: { action: 'provider_directory.clinic_branch.update_by_doctor', resource_id: branchAId },
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].actor_user_id).toBe(doctorAUserId);
    });

    it('404s (never 403, never a write) when a doctor targets an unrelated branch', async () => {
      const before = await prisma.clinicBranch.findUniqueOrThrow({ where: { id: branchBId } });

      const response = await request(server())
        .patch(`/v1/doctors/me/clinics/branches/${branchBId}`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ phone: '+20666666666' })
        .expect(404);

      expect(response.body).toMatchObject({ success: false, error: { code: 'RESOURCE_NOT_FOUND' } });

      const after = await prisma.clinicBranch.findUniqueOrThrow({ where: { id: branchBId } });
      expect(after.phone).toBe(before.phone);
      expect(after.version).toBe(before.version);
    });

    it('400s an attempt to change branch verification status through the doctor surface', async () => {
      await request(server())
        .patch(`/v1/doctors/me/clinics/branches/${branchAId}`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ status: 'VERIFIED' })
        .expect(400);
    });

    it('pauses and reactivates the doctor’s own affiliation — the only deactivation on this surface, and not a delete', async () => {
      const paused = await request(server())
        .patch(`/v1/doctors/me/clinics/affiliations/${affiliationAId}`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ status: 'PAUSED' })
        .expect(200);
      expect(paused.body.data.affiliationStatus).toBe('PAUSED');

      // A paused affiliation is still owned and still listed.
      const listed = await request(server()).get('/v1/doctors/me/clinics').set('Authorization', `Bearer ${doctorAToken}`).expect(200);
      expect(listed.body.data.items).toHaveLength(1);

      const reactivated = await request(server())
        .patch(`/v1/doctors/me/clinics/affiliations/${affiliationAId}`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(reactivated.body.data.affiliationStatus).toBe('ACTIVE');

      // Nothing was soft- or hard-deleted along the way.
      expect(await prisma.doctorClinicAffiliation.count({ where: { id: affiliationAId } })).toBe(1);
      expect(await prisma.clinicBranch.count({ where: { id: branchAId } })).toBe(1);
    });

    it('404s an attempt to pause another doctor’s affiliation', async () => {
      await request(server())
        .patch(`/v1/doctors/me/clinics/affiliations/${affiliationBId}`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ status: 'PAUSED' })
        .expect(404);

      const affiliation = await prisma.doctorClinicAffiliation.findUniqueOrThrow({ where: { id: affiliationBId } });
      expect(affiliation.status).toBe('ACTIVE');
    });
  });

  describe('3. schedule templates', () => {
    let templateAId: string;
    let templateAVersion: number;
    let templateBId: string;

    it('creates a schedule template on the doctor’s own affiliation', async () => {
      const response = await request(server())
        .post('/v1/doctors/me/schedule-templates')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ doctorClinicAffiliationId: affiliationAId, weekday: 1, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30, bufferMinutes: 5 })
        .expect(201);

      expect(response.body.data).toMatchObject({
        doctorClinicAffiliationId: affiliationAId,
        clinicBranchId: branchAId,
        ianaTimezone: 'Africa/Cairo',
        weekday: 1,
        startTime: '09:00',
        endTime: '17:00',
        slotDurationMinutes: 30,
        bufferMinutes: 5,
        version: 1,
      });
      templateAId = response.body.data.id;
      templateAVersion = response.body.data.version;
    });

    it('404s a create against another doctor’s affiliation', async () => {
      await request(server())
        .post('/v1/doctors/me/schedule-templates')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ doctorClinicAffiliationId: affiliationBId, weekday: 2, startTime: '09:00', endTime: '12:00', slotDurationMinutes: 30 })
        .expect(404);

      expect(await prisma.scheduleTemplate.count({ where: { doctor_clinic_affiliation_id: affiliationBId } })).toBe(0);
    });

    it('422s an inverted time window', async () => {
      const response = await request(server())
        .post('/v1/doctors/me/schedule-templates')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ doctorClinicAffiliationId: affiliationAId, weekday: 3, startTime: '17:00', endTime: '09:00', slotDurationMinutes: 30 })
        .expect(422);

      expect(response.body).toMatchObject({ success: false, error: { code: 'INVALID_SCHEDULE_WINDOW' } });
    });

    it('400s a malformed time (validation, distinct from the 422 business rule above)', async () => {
      await request(server())
        .post('/v1/doctors/me/schedule-templates')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ doctorClinicAffiliationId: affiliationAId, weekday: 3, startTime: '9am', endTime: '17:00', slotDurationMinutes: 30 })
        .expect(400);
    });

    it('lists only the caller’s own templates', async () => {
      const templateB = await prisma.scheduleTemplate.create({
        data: { doctor_clinic_affiliation_id: affiliationBId, weekday: 4, start_time: '10:00', end_time: '14:00', slot_duration_minutes: 20, buffer_minutes: 0 },
      });
      templateBId = templateB.id;

      const forA = await request(server()).get('/v1/doctors/me/schedule-templates').set('Authorization', `Bearer ${doctorAToken}`).expect(200);
      const forB = await request(server()).get('/v1/doctors/me/schedule-templates').set('Authorization', `Bearer ${doctorBToken}`).expect(200);

      expect(forA.body.data.items.map((t: { id: string }) => t.id)).toEqual([templateAId]);
      expect(forB.body.data.items.map((t: { id: string }) => t.id)).toEqual([templateBId]);
    });

    it('404s an affiliationId filter naming another doctor’s affiliation', async () => {
      await request(server())
        .get('/v1/doctors/me/schedule-templates')
        .query({ affiliationId: affiliationBId })
        .set('Authorization', `Bearer ${doctorAToken}`)
        .expect(404);
    });

    it('updates the caller’s own template and bumps its version', async () => {
      const response = await request(server())
        .patch(`/v1/doctors/me/schedule-templates/${templateAId}`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ endTime: '15:00', version: templateAVersion })
        .expect(200);

      expect(response.body.data).toMatchObject({ id: templateAId, endTime: '15:00' });
      expect(response.body.data.version).toBe(templateAVersion + 1);
      templateAVersion = response.body.data.version;
    });

    it('409s a stale-version update instead of clobbering a concurrent edit', async () => {
      const response = await request(server())
        .patch(`/v1/doctors/me/schedule-templates/${templateAId}`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ endTime: '18:00', version: 1 })
        .expect(409);

      expect(response.body).toMatchObject({ success: false, error: { code: 'OPTIMISTIC_LOCK_CONFLICT' } });

      const template = await prisma.scheduleTemplate.findUniqueOrThrow({ where: { id: templateAId } });
      expect(template.end_time).toBe('15:00');
    });

    it('404s (and writes nothing) when a doctor updates another doctor’s template', async () => {
      await request(server())
        .patch(`/v1/doctors/me/schedule-templates/${templateBId}`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ endTime: '23:00' })
        .expect(404);

      const template = await prisma.scheduleTemplate.findUniqueOrThrow({ where: { id: templateBId } });
      expect(template.end_time).toBe('14:00');
    });

    it('404s when a doctor deletes another doctor’s template', async () => {
      await request(server())
        .delete(`/v1/doctors/me/schedule-templates/${templateBId}`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .expect(404);

      expect(await prisma.scheduleTemplate.count({ where: { id: templateBId } })).toBe(1);
    });

    it('deletes the caller’s own template without touching already-generated slots', async () => {
      const futureSlot = await freshOpenSlot(affiliationAId, new Date('2027-01-04T09:00:00Z'));

      await request(server()).delete(`/v1/doctors/me/schedule-templates/${templateAId}`).set('Authorization', `Bearer ${doctorAToken}`).expect(204);

      expect(await prisma.scheduleTemplate.count({ where: { id: templateAId } })).toBe(0);
      // Part 33.8: not retroactive — the slot survives the template.
      expect(await prisma.appointmentSlot.count({ where: { id: futureSlot.id } })).toBe(1);

      const logs = await prisma.auditLog.findMany({
        where: { action: 'scheduling_appointments.schedule_template.delete', resource_id: templateAId },
      });
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('4. appointments', () => {
    let appointmentAId: string;
    let appointmentASlotId: string;
    let appointmentBId: string;

    beforeAll(async () => {
      const bookedA = await bookConfirmedAppointment(affiliationAId, new Date('2027-02-01T09:00:00Z'));
      appointmentAId = bookedA.appointmentId;
      appointmentASlotId = bookedA.slotId;

      const bookedB = await bookConfirmedAppointment(affiliationBId, new Date('2027-02-01T09:00:00Z'));
      appointmentBId = bookedB.appointmentId;
    }, 60000);

    it('lists only the calling doctor’s own appointments, with the patient identity the provider needs', async () => {
      const response = await request(server()).get('/v1/doctors/me/appointments').set('Authorization', `Bearer ${doctorAToken}`).expect(200);

      const ids = response.body.data.items.map((item: { appointmentId: string }) => item.appointmentId);
      expect(ids).toContain(appointmentAId);
      expect(ids).not.toContain(appointmentBId);

      const mine = response.body.data.items.find((item: { appointmentId: string }) => item.appointmentId === appointmentAId);
      expect(mine).toMatchObject({
        status: 'CONFIRMED',
        patientId: patientUserId,
        patientName: 'Mona Hassan',
        clinicBranchId: branchAId,
        ianaTimezone: 'Africa/Cairo',
      });
    });

    it('filters by date range with BOTH bounds honoured', async () => {
      const inRange = await request(server())
        .get('/v1/doctors/me/appointments')
        .query({ from: '2027-02-01T00:00:00Z', to: '2027-02-02T00:00:00Z' })
        .set('Authorization', `Bearer ${doctorAToken}`)
        .expect(200);
      expect(inRange.body.data.items.map((i: { appointmentId: string }) => i.appointmentId)).toContain(appointmentAId);

      // The `from` bound must not be silently dropped when `to` is also sent.
      const outOfRange = await request(server())
        .get('/v1/doctors/me/appointments')
        .query({ from: '2027-03-01T00:00:00Z', to: '2027-03-02T00:00:00Z' })
        .set('Authorization', `Bearer ${doctorAToken}`)
        .expect(200);
      expect(outOfRange.body.data.items).toHaveLength(0);
    });

    it('filters by status and by branch', async () => {
      const byStatus = await request(server())
        .get('/v1/doctors/me/appointments')
        .query({ status: 'CONFIRMED' })
        .set('Authorization', `Bearer ${doctorAToken}`)
        .expect(200);
      expect(byStatus.body.data.items.every((i: { status: string }) => i.status === 'CONFIRMED')).toBe(true);

      const byBranch = await request(server())
        .get('/v1/doctors/me/appointments')
        .query({ clinicBranchId: branchAId })
        .set('Authorization', `Bearer ${doctorAToken}`)
        .expect(200);
      expect(byBranch.body.data.items.map((i: { appointmentId: string }) => i.appointmentId)).toContain(appointmentAId);
    });

    it('404s a branch filter naming another clinic’s branch — it cannot widen the scope', async () => {
      await request(server())
        .get('/v1/doctors/me/appointments')
        .query({ clinicBranchId: branchBId })
        .set('Authorization', `Bearer ${doctorAToken}`)
        .expect(404);
    });

    it('opens the detail of its own appointment and 404s another doctor’s', async () => {
      const detail = await request(server()).get(`/v1/doctors/me/appointments/${appointmentAId}`).set('Authorization', `Bearer ${doctorAToken}`).expect(200);
      expect(detail.body.data).toMatchObject({ appointmentId: appointmentAId, patientPhone: `+2012${numericSuffix}3` });

      await request(server()).get(`/v1/doctors/me/appointments/${appointmentBId}`).set('Authorization', `Bearer ${doctorAToken}`).expect(404);
    });

    it('404s a cancel of another doctor’s appointment, leaving it CONFIRMED', async () => {
      await request(server())
        .post(`/v1/doctors/me/appointments/${appointmentBId}/cancel`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'PROVIDER_REQUEST' })
        .expect(404);

      const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentBId } });
      expect(appointment.status).toBe('CONFIRMED');
    });

    it('400s a doctor cancel that sends a non-PROVIDER_REQUEST reason', async () => {
      await request(server())
        .post(`/v1/doctors/me/appointments/${appointmentAId}/cancel`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'PATIENT_REQUEST' })
        .expect(400);
    });

    it('reschedules onto another slot of the same affiliation, atomically and with history preserved', async () => {
      const newSlot = await freshOpenSlot(affiliationAId, new Date('2027-02-03T11:00:00Z'));

      const response = await request(server())
        .post(`/v1/doctors/me/appointments/${appointmentAId}/reschedule`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ newSlotId: newSlot.id })
        .expect(200);

      expect(response.body.data).toMatchObject({ status: 'CONFIRMED', previousAppointmentId: appointmentAId, slotId: newSlot.id });
      const replacementId = response.body.data.appointmentId;

      const old = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentAId } });
      const replacement = await prisma.appointment.findUniqueOrThrow({ where: { id: replacementId } });
      expect(old.status).toBe('RESCHEDULED');
      expect(replacement.status).toBe('CONFIRMED');
      expect(replacement.rescheduled_from_appointment_id).toBe(appointmentAId);
      // Ownership and the money trail both survive the move.
      expect(replacement.patient_id).toBe(patientUserId);
      expect(replacement.doctor_clinic_affiliation_id).toBe(affiliationAId);
      expect(replacement.payment_intent_id).toBe(old.payment_intent_id);

      // Old slot released, new slot booked.
      expect((await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: appointmentASlotId } })).status).toBe('OPEN');
      expect((await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: newSlot.id } })).status).toBe('BOOKED');

      appointmentAId = replacementId;
      appointmentASlotId = newSlot.id;
    }, 30000);

    it('404s a reschedule onto another affiliation’s slot — a doctor cannot move a patient off their own calendar', async () => {
      const foreignSlot = await freshOpenSlot(affiliationBId, new Date('2027-02-04T11:00:00Z'));

      await request(server())
        .post(`/v1/doctors/me/appointments/${appointmentAId}/reschedule`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ newSlotId: foreignSlot.id })
        .expect(404);

      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentAId } })).status).toBe('CONFIRMED');
    });

    it('cancels its own appointment: releases the slot, refunds in full, audits, and emits an outbox event', async () => {
      const response = await request(server())
        .post(`/v1/doctors/me/appointments/${appointmentAId}/cancel`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'PROVIDER_REQUEST', note: 'Doctor unavailable' })
        .expect(201);

      expect(response.body.data).toMatchObject({ status: 'CANCELLED', feeApplied: 0 });
      expect(response.body.data.refundAmount).toBeGreaterThan(0);

      const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentAId } });
      expect(appointment.status).toBe('CANCELLED');
      expect(appointment.cancelled_by).toBe(doctorAUserId);
      expect(appointment.cancelled_reason).toBe('PROVIDER_REQUEST: Doctor unavailable');

      // Slot released atomically with the state change.
      expect((await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: appointmentASlotId } })).status).toBe('OPEN');

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'scheduling_appointments.appointment.cancel', resource_id: appointmentAId, actor_user_id: doctorAUserId },
      });
      expect(audit).not.toBeNull();
      expect(audit?.reason_code).toBe('PROVIDER_REQUEST');

      const event = await prisma.outboxEvent.findFirst({
        where: { event_name: 'AppointmentCancelled' },
        orderBy: { created_at: 'desc' },
      });
      expect(event).not.toBeNull();
      expect(event?.payload).toMatchObject({ appointmentId: appointmentAId, patientId: patientUserId, cancelledBy: 'DOCTOR' });
    }, 30000);

    it('422s a second cancel of the same appointment (already CANCELLED, not re-refunded)', async () => {
      const response = await request(server())
        .post(`/v1/doctors/me/appointments/${appointmentAId}/cancel`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'PROVIDER_REQUEST' })
        .expect(422);

      expect(response.body).toMatchObject({ success: false, error: { code: 'APPOINTMENT_NOT_CANCELLABLE' } });
    });

    it('lets exactly one of two simultaneous provider cancels win, with no corrupted state', async () => {
      const booked = await bookConfirmedAppointment(affiliationAId, new Date('2027-02-05T09:00:00Z'));

      const results = await Promise.allSettled(
        [0, 1].map(() =>
          request(server())
            .post(`/v1/doctors/me/appointments/${booked.appointmentId}/cancel`)
            .set('Authorization', `Bearer ${doctorAToken}`)
            .set('Idempotency-Key', randomUUID())
            .send({ reason: 'PROVIDER_REQUEST' }),
        ),
      );

      const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : 500));
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409 || s === 422)).toHaveLength(1);

      const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: booked.appointmentId } });
      expect(appointment.status).toBe('CANCELLED');
      expect((await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: booked.slotId } })).status).toBe('OPEN');
      // Exactly one refund, never two.
      expect(await prisma.refund.count({ where: { payment_intent_id: appointment.payment_intent_id ?? '' } })).toBe(1);
    }, 60000);
  });

  describe('5. no regression on the existing patient surface', () => {
    it('still scopes GET /v1/appointments to the calling patient and rejects a DOCTOR token', async () => {
      const asPatient = await request(server()).get('/v1/appointments').set('Authorization', `Bearer ${patientToken}`).expect(200);
      expect(asPatient.body.success).toBe(true);

      await request(server()).get('/v1/appointments').set('Authorization', `Bearer ${doctorAToken}`).expect(403);
    });

    it('still returns an unconfirmed HOLD for a patient-initiated reschedule (unchanged contract)', async () => {
      const booked = await bookConfirmedAppointment(affiliationAId, new Date('2027-02-06T09:00:00Z'));
      const newSlot = await freshOpenSlot(affiliationAId, new Date('2027-02-06T10:00:00Z'));

      const response = await request(server())
        .post(`/v1/appointments/${booked.appointmentId}/reschedule`)
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ newSlotId: newSlot.id })
        .expect(201);

      expect(response.body.data).toMatchObject({ status: 'HELD', previousAppointmentId: booked.appointmentId });
      expect(response.body.data).toHaveProperty('holdId');
      expect(response.body.data).toHaveProperty('expiresAt');
    }, 60000);

    it('still gates schedule-template admin CRUD to ADMIN only', async () => {
      await request(server()).get('/v1/schedule-templates').query({ affiliationId: affiliationAId }).set('Authorization', `Bearer ${doctorAToken}`).expect(403);
      await request(server()).get('/v1/schedule-templates').query({ affiliationId: affiliationAId }).set('Authorization', `Bearer ${adminToken}`).expect(200);
    });
  });
});
