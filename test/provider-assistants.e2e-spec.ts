import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/kernel/prisma/prisma.service';

/**
 * Clinic Assistant feature (`med-super/docs/assistant_feature_backend_integration.md`):
 * a Doctor provisions/manages CLINIC_STAFF accounts scoped to their own
 * Doctor.id. Covers the full HTTP/auth/authorization/ownership/login
 * round trip against a real Postgres — JWTs for the two doctors are minted
 * directly via `JwtService` (same shortcut `provider-directory.e2e-spec.ts`
 * takes for Admin login), but the assistant's own token comes from a real
 * `POST /v1/auth/password/login` call, so the create -> login -> /auth/me
 * chain is exercised for real, not just assumed.
 */
describe('Provider Assistants (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const suffix = randomUUID().slice(0, 8);
  const specialtyCode = `E2E_ASSISTANT_SPECIALTY_${suffix}`;
  // E.164 phone numbers must be all-digits — `suffix` above is hex (can
  // contain a-f), so phone numbers use this purely numeric suffix instead.
  const numericSuffix = (Date.now() % 10000000).toString().padStart(7, '0');

  let doctorAUserId: string;
  let doctorAId: string;
  let doctorAToken: string;
  let doctorBUserId: string;
  let doctorBId: string;
  let doctorBToken: string;
  let branchA1Id: string;
  let branchA2Id: string;
  let branchBId: string;
  let affiliationA2Id: string;

  const assistantPhone = `+2012${numericSuffix}0`;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);

    await prisma.specialty.create({ data: { code: specialtyCode, name_en: 'E2E Assistant Specialty', name_ar: 'تخصص' } });

    const doctorAUser = await prisma.user.create({ data: { phone: `+2012${numericSuffix}1`, first_name: 'Doctor', last_name: 'A' } });
    doctorAUserId = doctorAUser.id;
    createdUserIds.push(doctorAUserId);
    const doctorA = await prisma.doctor.create({
      data: { user_id: doctorAUserId, specialty_code: specialtyCode, license_number: `LIC-A-${suffix}` },
    });
    doctorAId = doctorA.id;
    const doctorAMembership = await prisma.roleMembership.create({
      data: { user_id: doctorAUserId, role_code: 'DOCTOR', context_type: 'DOCTOR' },
    });

    const clinicA = await prisma.clinic.create({
      data: { legal_name: `E2E Assistant Clinic A ${suffix}`, brand_name: `Assistant Clinic A ${suffix}`, status: 'VERIFIED' },
    });
    const addressA1 = await prisma.address.create({ data: { line1: '1 Tahrir St', city: 'Cairo', region_code: 'CAI', country_code: 'EG' } });
    const branchA1 = await prisma.clinicBranch.create({
      data: { clinic_id: clinicA.id, address_id: addressA1.id, phone: '+20200000011', iana_timezone: 'Africa/Cairo', status: 'VERIFIED' },
    });
    branchA1Id = branchA1.id;
    await prisma.doctorClinicAffiliation.create({
      data: { doctor_id: doctorAId, clinic_branch_id: branchA1Id, consult_fee: '250.00', currency: 'EGP' },
    });
    const addressA2 = await prisma.address.create({ data: { line1: '2 Nile St', city: 'Giza', region_code: 'GIZ', country_code: 'EG' } });
    const branchA2 = await prisma.clinicBranch.create({
      data: { clinic_id: clinicA.id, address_id: addressA2.id, phone: '+20200000012', iana_timezone: 'Africa/Cairo', status: 'VERIFIED' },
    });
    branchA2Id = branchA2.id;
    const affiliationA2 = await prisma.doctorClinicAffiliation.create({
      data: { doctor_id: doctorAId, clinic_branch_id: branchA2Id, consult_fee: '250.00', currency: 'EGP' },
    });
    affiliationA2Id = affiliationA2.id;

    const doctorBUser = await prisma.user.create({ data: { phone: `+2012${numericSuffix}2`, first_name: 'Doctor', last_name: 'B' } });
    doctorBUserId = doctorBUser.id;
    createdUserIds.push(doctorBUserId);
    const doctorB = await prisma.doctor.create({
      data: { user_id: doctorBUserId, specialty_code: specialtyCode, license_number: `LIC-B-${suffix}` },
    });
    doctorBId = doctorB.id;
    const doctorBMembership = await prisma.roleMembership.create({
      data: { user_id: doctorBUserId, role_code: 'DOCTOR', context_type: 'DOCTOR' },
    });

    const clinicB = await prisma.clinic.create({
      data: { legal_name: `E2E Assistant Clinic B ${suffix}`, brand_name: `Assistant Clinic B ${suffix}`, status: 'VERIFIED' },
    });
    const addressB = await prisma.address.create({ data: { line1: '9 Corniche', city: 'Alexandria', region_code: 'ALX', country_code: 'EG' } });
    const branchB = await prisma.clinicBranch.create({
      data: { clinic_id: clinicB.id, address_id: addressB.id, phone: '+20200000013', iana_timezone: 'Africa/Cairo', status: 'VERIFIED' },
    });
    branchBId = branchB.id;
    await prisma.doctorClinicAffiliation.create({
      data: { doctor_id: doctorBId, clinic_branch_id: branchBId, consult_fee: '300.00', currency: 'EGP' },
    });

    doctorAToken = jwt.sign({
      sub: doctorAUserId,
      roleMembershipId: doctorAMembership.id,
      roleCode: 'DOCTOR',
      contextType: 'DOCTOR',
      permissions: [],
    });
    doctorBToken = jwt.sign({
      sub: doctorBUserId,
      roleMembershipId: doctorBMembership.id,
      roleCode: 'DOCTOR',
      contextType: 'DOCTOR',
      permissions: [],
    });
  }, 30000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actor_user_id: { in: createdUserIds } } });
    const assistantUser = await prisma.user.findUnique({ where: { phone: assistantPhone } });
    if (assistantUser) {
      await prisma.refreshToken.deleteMany({ where: { user_id: assistantUser.id } });
      await prisma.roleMembership.deleteMany({ where: { user_id: assistantUser.id } });
      await prisma.user.delete({ where: { id: assistantUser.id } });
    }
    await prisma.doctor.deleteMany({ where: { id: { in: [doctorAId, doctorBId] } } });
    await prisma.roleMembership.deleteMany({ where: { user_id: { in: [doctorAUserId, doctorBUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.specialty.delete({ where: { code: specialtyCode } });
    await app.close();
  }, 30000);

  describe('authentication and authorization', () => {
    it('401s an anonymous request', async () => {
      await request(app.getHttpServer()).get('/v1/provider/assistants').expect(401);
    });

    it('403s a request without a DOCTOR context (e.g. a PATIENT-context token)', async () => {
      const patientUser = await prisma.user.create({ data: { phone: `+2012${numericSuffix}3` } });
      createdUserIds.push(patientUser.id);
      const patientMembership = await prisma.roleMembership.create({
        data: { user_id: patientUser.id, role_code: 'PATIENT', context_type: 'PATIENT' },
      });
      const patientToken = jwt.sign({
        sub: patientUser.id,
        roleMembershipId: patientMembership.id,
        roleCode: 'PATIENT',
        contextType: 'PATIENT',
        permissions: [],
      });

      const res = await request(app.getHttpServer())
        .get('/v1/provider/assistants')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(403);
      expect(res.body.error.code).toBe('ROLE_NOT_PERMITTED');
    });
  });

  describe('validation', () => {
    it('rejects an invalid phone number', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/provider/assistants')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ phone: 'not-a-phone', display_name: 'Sara Ahmed', clinic_branch_ids: [] })
        .expect(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a missing display_name', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/provider/assistants')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ phone: assistantPhone })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an empty clinic_branch_ids', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/provider/assistants')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ phone: assistantPhone, display_name: 'Sara Ahmed', clinic_branch_ids: [] })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it("rejects a clinic_branch_id that doesn't belong to the calling doctor (IDOR prevention)", async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/provider/assistants')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ phone: assistantPhone, display_name: 'Sara Ahmed', clinic_branch_ids: [branchBId] })
        .expect(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  let assistantId: string;
  let firstGeneratedPassword: string;

  describe('golden path: create, list, ownership, update, login, suspend, delete', () => {
    it('doctor A creates an assistant — response matches the Flutter contract exactly, including the one-time password', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/provider/assistants')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({
          phone: assistantPhone,
          display_name: 'Sara Ahmed',
          title: 'Front desk',
          subtitle: 'Reception & check-in',
          clinic_branch_ids: [branchA1Id],
        })
        .expect(201);

      const body = res.body.data;
      expect(Object.keys(body).sort()).toEqual(
        ['clinic_branch_ids', 'created_at', 'display_name', 'generated_password', 'id', 'phone', 'status', 'subtitle', 'title'].sort(),
      );
      expect(body.phone).toBe(assistantPhone);
      expect(body.display_name).toBe('Sara Ahmed');
      expect(body.title).toBe('Front desk');
      expect(body.subtitle).toBe('Reception & check-in');
      expect(body.clinic_branch_ids).toEqual([branchA1Id]);
      expect(body.status).toBe('ACTIVE');
      expect(new Date(body.created_at).toString()).not.toBe('Invalid Date');
      expect(typeof body.generated_password).toBe('string');
      expect(body.generated_password.length).toBeGreaterThanOrEqual(8);

      assistantId = body.id;
      firstGeneratedPassword = body.generated_password;
    });

    it('re-creating the same phone under the same doctor 409s (duplicate prevention)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/provider/assistants')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ phone: assistantPhone, display_name: 'Sara Ahmed', clinic_branch_ids: [branchA1Id] })
        .expect(409);
      expect(res.body.error.code).toBe('STAFF_ALREADY_PROVISIONED');
    });

    it("doctor A's list includes the new assistant", async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/provider/assistants')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .expect(200);

      const item = res.body.data.items.find((i: any) => i.id === assistantId);
      expect(item).toMatchObject({ phone: assistantPhone, display_name: 'Sara Ahmed', status: 'ACTIVE' });
      expect(item.generated_password).toBeUndefined();
    });

    it("doctor B's list does not include doctor A's assistant (ownership scoping)", async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/provider/assistants')
        .set('Authorization', `Bearer ${doctorBToken}`)
        .expect(200);

      expect(res.body.data.items.find((i: any) => i.id === assistantId)).toBeUndefined();
    });

    it("doctor B cannot read/update/delete doctor A's assistant by id — 404, never 403 (IDOR prevention)", async () => {
      const patchRes = await request(app.getHttpServer())
        .patch(`/v1/provider/assistants/${assistantId}`)
        .set('Authorization', `Bearer ${doctorBToken}`)
        .send({ display_name: 'Hijacked' })
        .expect(404);
      expect(patchRes.body.error.code).toBe('RESOURCE_NOT_FOUND');

      const deleteRes = await request(app.getHttpServer())
        .delete(`/v1/provider/assistants/${assistantId}`)
        .set('Authorization', `Bearer ${doctorBToken}`)
        .expect(404);
      expect(deleteRes.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('doctor A updates the display name', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/provider/assistants/${assistantId}`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ display_name: 'Sara A. Ahmed' })
        .expect(200);

      expect(res.body.data.display_name).toBe('Sara A. Ahmed');
      expect(res.body.data.status).toBe('ACTIVE');
      // Unset in the PATCH body — branches/title/subtitle from create must be untouched.
      expect(res.body.data.clinic_branch_ids).toEqual([branchA1Id]);
      expect(res.body.data.title).toBe('Front desk');
    });

    it("doctor A replaces the assistant's assigned branches (full replace, not merge)", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/provider/assistants/${assistantId}`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ clinic_branch_ids: [branchA2Id] })
        .expect(200);

      expect(res.body.data.clinic_branch_ids).toEqual([branchA2Id]);
    });

    it("rejects replacing branches with one that doesn't belong to doctor A (IDOR prevention)", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/provider/assistants/${assistantId}`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ clinic_branch_ids: [branchBId] })
        .expect(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    let assistantToken: string;

    it('the assistant logs in through the existing password-login endpoint', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/password/login')
        .send({ phone: assistantPhone, password: firstGeneratedPassword })
        .expect(201);

      expect(res.body.data.accessToken).toEqual(expect.any(String));
      assistantToken = res.body.data.accessToken;

      const decoded = jwt.decode(assistantToken) as any;
      expect(decoded.roleCode).toBe('CLINIC_STAFF');
      expect(decoded.contextType).toBe('CLINIC_STAFF');
    });

    it("GET /v1/auth/me resolves the assistant's active role as CLINIC_STAFF, scoped to doctor A's id", async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${assistantToken}`)
        .expect(200);

      expect(res.body.data.activeRole).toBe('CLINIC_STAFF');
      expect(res.body.data.contextId).toBe(doctorAId);
    });

    it("the assistant's GET doctors/me/clinics only returns their assigned branch (A2), not doctor A's full set (A1+A2)", async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/doctors/me/clinics')
        .set('Authorization', `Bearer ${assistantToken}`)
        .expect(200);

      const branchIds = res.body.data.items.map((item: any) => item.clinic_branch_id ?? item.clinicBranchId);
      expect(branchIds).toEqual([branchA2Id]);
    });

    it('the assistant can edit operational fields of their own assigned branch (A2)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/doctors/me/clinics/branches/${branchA2Id}`)
        .set('Authorization', `Bearer ${assistantToken}`)
        .send({ phone: '+201555555555' })
        .expect(200);

      expect(res.body.data.phone).toBe('+201555555555');
    });

    it("404s an assistant editing a branch outside their assignment (A1 — assigned to doctor A but not this assistant)", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/doctors/me/clinics/branches/${branchA1Id}`)
        .set('Authorization', `Bearer ${assistantToken}`)
        .send({ phone: '+201555555556' })
        .expect(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('the assistant cannot create or delete a branch — doctor-only, ownership-level actions', async () => {
      await request(app.getHttpServer())
        .post(`/v1/doctors/me/clinics/${doctorAId}/branches`)
        .set('Authorization', `Bearer ${assistantToken}`)
        .send({ phone: '+201555555557', ianaTimezone: 'Africa/Cairo', address: { line1: 'x', city: 'y', regionCode: 'CAI', countryCode: 'EG' } })
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/v1/doctors/me/clinics/branches/${branchA2Id}`)
        .set('Authorization', `Bearer ${assistantToken}`)
        .expect(403);
    });

    let scheduleTemplateId: string;

    it('the assistant can create a schedule template on their own assigned branch (A2)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/doctors/me/schedule-templates')
        .set('Authorization', `Bearer ${assistantToken}`)
        .send({
          doctorClinicAffiliationId: affiliationA2Id,
          weekday: 2,
          startTime: '09:00',
          endTime: '17:00',
          slotDurationMinutes: 30,
        })
        .expect(201);

      expect(res.body.data.doctorClinicAffiliationId).toBe(affiliationA2Id);
      scheduleTemplateId = res.body.data.id;
    });

    it('the assistant can update their own schedule template', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/doctors/me/schedule-templates/${scheduleTemplateId}`)
        .set('Authorization', `Bearer ${assistantToken}`)
        .send({ startTime: '10:00' })
        .expect(200);

      expect(res.body.data.startTime).toBe('10:00');
    });

    it("404s an assistant creating a schedule template on a branch outside their assignment (A1)", async () => {
      await request(app.getHttpServer())
        .post('/v1/doctors/me/schedule-templates')
        .set('Authorization', `Bearer ${assistantToken}`)
        .send({
          doctorClinicAffiliationId: (
            await prisma.doctorClinicAffiliation.findFirstOrThrow({ where: { clinic_branch_id: branchA1Id } })
          ).id,
          weekday: 3,
          startTime: '09:00',
          endTime: '17:00',
          slotDurationMinutes: 30,
        })
        .expect(404);
    });

    it('the assistant can delete their own schedule template', async () => {
      const template = await prisma.scheduleTemplate.findUniqueOrThrow({ where: { id: scheduleTemplateId } });
      await request(app.getHttpServer())
        .delete(`/v1/doctors/me/schedule-templates/${scheduleTemplateId}`)
        .set('Authorization', `Bearer ${assistantToken}`)
        .query({ version: template.version })
        .expect(204);
    });

    it('the assistant (CLINIC_STAFF) is forbidden from assistant-management endpoints', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/provider/assistants')
        .set('Authorization', `Bearer ${assistantToken}`)
        .expect(403);
      expect(res.body.error.code).toBe('ROLE_NOT_PERMITTED');
    });

    it('doctor A suspends the assistant', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/provider/assistants/${assistantId}`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      expect(res.body.data.status).toBe('SUSPENDED');
    });

    it('a SUSPENDED assistant cannot log in, even with the correct password', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/password/login')
        .send({ phone: assistantPhone, password: firstGeneratedPassword })
        .expect(401);
    });

    it('doctor A deletes (soft-deactivates) the assistant', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/provider/assistants/${assistantId}`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .expect(204);
    });

    it('the deleted assistant no longer appears in the list', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/provider/assistants')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .expect(200);

      expect(res.body.data.items.find((i: any) => i.id === assistantId)).toBeUndefined();
    });

    it('the deleted assistant can no longer log in (no active role membership)', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/password/login')
        .send({ phone: assistantPhone, password: firstGeneratedPassword })
        .expect(401);
    });

    it('re-provisioning the same phone after deletion reactivates the same membership id with a fresh password', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/provider/assistants')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({ phone: assistantPhone, display_name: 'Sara Ahmed Again', clinic_branch_ids: [branchA1Id] })
        .expect(201);

      expect(res.body.data.id).toBe(assistantId);
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.generated_password).not.toBe(firstGeneratedPassword);

      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/password/login')
        .send({ phone: assistantPhone, password: res.body.data.generated_password })
        .expect(201);
      expect(loginRes.body.data.accessToken).toEqual(expect.any(String));
    });
  });
});
