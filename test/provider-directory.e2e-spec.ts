import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/kernel/prisma/prisma.service';

/**
 * File 11 Part 26 "Security"/"API contract" test types + the task's stated
 * Definition of Done: a seeded doctor can be reviewed and verified by an
 * Admin and becomes visible via the directory/search API, while
 * unverified/suspended providers stay server-side invisible.
 *
 * JWTs are minted directly via `JwtService` rather than a real OTP login —
 * Admin login mechanics are explicitly out of scope for this phase (File 12
 * Part 32.6), so this is the same shortcut a real integration test would
 * take. `sub`/`roleMembershipId` still reference real rows: `AuditLog`'s FK
 * to `users` means an audit-writing route needs a genuine actor to insert
 * against, not just a plausible-looking token.
 */
describe('Provider Directory (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const suffix = randomUUID().slice(0, 8);
  const specialtyCode = `E2E_SPECIALTY_${suffix}`;

  let adminUserId: string;
  let adminMembershipId: string;
  let patientUserId: string;
  let patientMembershipId: string;
  let adminToken: string;
  let patientToken: string;

  let clinicId: string;
  let branchId: string;
  let doctorId: string;

  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);

    const adminUser = await prisma.user.create({
      data: { phone: `+2011${suffix}0`, first_name: 'E2E', last_name: 'Admin' },
    });
    adminUserId = adminUser.id;
    createdUserIds.push(adminUserId);
    const adminMembership = await prisma.roleMembership.create({
      data: { user_id: adminUserId, role_code: 'ADMIN', context_type: 'ADMIN' },
    });
    adminMembershipId = adminMembership.id;

    const patientUser = await prisma.user.create({
      data: { phone: `+2011${suffix}1`, first_name: 'E2E', last_name: 'Patient' },
    });
    patientUserId = patientUser.id;
    createdUserIds.push(patientUserId);
    const patientMembership = await prisma.roleMembership.create({
      data: { user_id: patientUserId, role_code: 'PATIENT', context_type: 'PATIENT' },
    });
    patientMembershipId = patientMembership.id;

    adminToken = jwt.sign({
      sub: adminUserId,
      roleMembershipId: adminMembershipId,
      roleCode: 'ADMIN',
      contextType: 'ADMIN',
      permissions: [],
    });
    patientToken = jwt.sign({
      sub: patientUserId,
      roleMembershipId: patientMembershipId,
      roleCode: 'PATIENT',
      contextType: 'PATIENT',
      permissions: [],
    });

    await prisma.specialty.create({ data: { code: specialtyCode, name_en: 'E2E Specialty', name_ar: 'تخصص' } });

    const clinic = await prisma.clinic.create({
      data: { legal_name: `E2E Clinic ${suffix}`, brand_name: `E2E Clinic ${suffix}`, status: 'VERIFIED' },
    });
    clinicId = clinic.id;

    const address = await prisma.address.create({
      data: { line1: 'Test St', city: 'Cairo', region_code: 'CAI', country_code: 'EG' },
    });
    const branch = await prisma.clinicBranch.create({
      data: { clinic_id: clinicId, address_id: address.id, phone: '+201', iana_timezone: 'Africa/Cairo', status: 'VERIFIED' },
    });
    branchId = branch.id;

    const doctorUser = await prisma.user.create({
      data: { phone: `+2011${suffix}2`, first_name: 'E2E', last_name: 'Doctor' },
    });
    createdUserIds.push(doctorUser.id);
    const doctor = await prisma.doctor.create({
      data: { user_id: doctorUser.id, specialty_code: specialtyCode, license_number: `LIC-${suffix}` },
    });
    doctorId = doctor.id;

    await prisma.doctorClinicAffiliation.create({
      data: { doctor_id: doctorId, clinic_branch_id: branchId, consult_fee: '100.00', currency: 'EGP' },
    });
  }, 30000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actor_user_id: { in: createdUserIds } } });
    await prisma.doctorClinicAffiliation.deleteMany({ where: { doctor_id: doctorId } });
    await prisma.doctor.delete({ where: { id: doctorId } });
    await prisma.clinicBranch.delete({ where: { id: branchId } });
    await prisma.clinic.delete({ where: { id: clinicId } });
    await prisma.roleMembership.deleteMany({ where: { user_id: { in: [adminUserId, patientUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.specialty.delete({ where: { code: specialtyCode } });
    await app.close();
  }, 30000);

  describe('before verification', () => {
    it('404s anonymous GET on the PENDING doctor (never reveal existence)', async () => {
      await request(app.getHttpServer()).get(`/v1/doctors/${doctorId}`).expect(404);
    });

    it('excludes the PENDING doctor from anonymous search', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/doctors/search')
        .query({ specialty: specialtyCode })
        .expect(200);

      expect(res.body.data.items.find((i: any) => i.doctorId === doctorId)).toBeUndefined();
    });

    it('lets an Admin see the PENDING doctor via the same detail endpoint (@OptionalAuth)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/doctors/${doctorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.doctor.status).toBe('PENDING');
    });

    it('403s a non-Admin (patient) verify attempt', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/doctors/${doctorId}/verify`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ROLE_NOT_PERMITTED');
    });

    it('401s an anonymous verify attempt', async () => {
      await request(app.getHttpServer()).post(`/v1/doctors/${doctorId}/verify`).expect(401);
    });
  });

  describe('golden path: Admin verifies, doctor becomes visible, Admin suspends, invisible again', () => {
    it('Admin verifies the doctor', async () => {
      await request(app.getHttpServer())
        .post(`/v1/doctors/${doctorId}/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('anonymous GET now returns the doctor', async () => {
      const res = await request(app.getHttpServer()).get(`/v1/doctors/${doctorId}`).expect(200);
      expect(res.body.data.doctor.status).toBe('VERIFIED');
      expect(res.body.data.affiliations).toHaveLength(1);
    });

    it('anonymous search now includes the doctor', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/doctors/search')
        .query({ specialty: specialtyCode })
        .expect(200);

      const item = res.body.data.items.find((i: any) => i.doctorId === doctorId);
      expect(item).toBeDefined();
      expect(item.clinicBranchId).toBe(branchId);
      expect(item.nextAvailableSlot).toBeNull();
    });

    it('an outbox ProviderVerified event was written in the same transaction as the status change', async () => {
      const events = await prisma.outboxEvent.findMany({ where: { event_name: 'ProviderVerified' } });
      expect(events.some((e) => (e.payload as any).providerId === doctorId)).toBe(true);
    });

    it('Admin suspends the doctor', async () => {
      await request(app.getHttpServer())
        .post(`/v1/doctors/${doctorId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('anonymous GET 404s again after suspension', async () => {
      await request(app.getHttpServer()).get(`/v1/doctors/${doctorId}`).expect(404);
    });

    it('anonymous search excludes the doctor again after suspension', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/doctors/search')
        .query({ specialty: specialtyCode })
        .expect(200);

      expect(res.body.data.items.find((i: any) => i.doctorId === doctorId)).toBeUndefined();
    });

    it('Admin still sees the SUSPENDED doctor via the same detail endpoint', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/doctors/${doctorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.doctor.status).toBe('SUSPENDED');
    });
  });
});
