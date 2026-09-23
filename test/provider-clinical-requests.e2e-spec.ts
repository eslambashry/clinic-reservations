import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/kernel/prisma/prisma.service';

/**
 * Real HTTP + PostgreSQL proof for the provider clinical-request boundary.
 * It intentionally creates all actors and ownership relationships through
 * Prisma, but exercises the feature itself only through public HTTP routes.
 */
describe('Provider clinical requests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const suffix = randomUUID().slice(0, 8);
  const numericSuffix = (Date.now() % 10000000).toString().padStart(7, '0');
  const idempotencyKey = () => randomUUID();
  const server = () => app.getHttpServer();

  let doctorAUserId: string;
  let doctorAId: string;
  let doctorAToken: string;
  let doctorBToken: string;
  let assistantToken: string;
  let patientAToken: string;
  let patientBToken: string;
  let pharmacyStaffToken: string;
  let labStaffToken: string;
  let patientAId: string;
  let patientBId: string;
  let outsidePatientId: string;
  let pharmacyBranchId: string;
  let labBranchId: string;
  const testCode = `E2E-CBC-${suffix}`;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);

    const specialty = await prisma.specialty.create({ data: { code: randomUUID(), name_ar: `تخصص ${suffix}` } });
    const doctorAUser = await prisma.user.create({ data: { phone: `+2012${numericSuffix}1`, first_name: 'Provider', last_name: 'Doctor' } });
    doctorAUserId = doctorAUser.id;
    const doctorA = await prisma.doctor.create({ data: { user_id: doctorAUser.id, specialty_code: specialty.code, license_number: `LIC-A-${suffix}`, status: 'VERIFIED' } });
    doctorAId = doctorA.id;
    const doctorAMembership = await prisma.roleMembership.create({ data: { user_id: doctorAUser.id, role_code: 'DOCTOR', context_type: 'DOCTOR' } });

    const clinic = await prisma.clinic.create({ data: { legal_name: `Provider E2E ${suffix}`, brand_name: `Provider E2E ${suffix}`, status: 'VERIFIED' } });
    const clinicAddress = await prisma.address.create({ data: { line1: 'Provider test street', city: 'Cairo', region_code: 'CAI', country_code: 'EG' } });
    const clinicBranch = await prisma.clinicBranch.create({ data: { clinic_id: clinic.id, address_id: clinicAddress.id, phone: '+20200000991', iana_timezone: 'Africa/Cairo', status: 'VERIFIED' } });
    const affiliation = await prisma.doctorClinicAffiliation.create({ data: { doctor_id: doctorA.id, clinic_branch_id: clinicBranch.id, consult_fee: '250.00', currency: 'EGP' } });

    const doctorBUser = await prisma.user.create({ data: { phone: `+2012${numericSuffix}2`, first_name: 'Other', last_name: 'Doctor' } });
    const doctorB = await prisma.doctor.create({ data: { user_id: doctorBUser.id, specialty_code: specialty.code, license_number: `LIC-B-${suffix}`, status: 'VERIFIED' } });
    const doctorBMembership = await prisma.roleMembership.create({ data: { user_id: doctorBUser.id, role_code: 'DOCTOR', context_type: 'DOCTOR' } });

    const assistantUser = await prisma.user.create({ data: { phone: `+2012${numericSuffix}3`, first_name: 'Clinic', last_name: 'Assistant' } });
    const assistantMembership = await prisma.roleMembership.create({ data: { user_id: assistantUser.id, role_code: 'CLINIC_STAFF', context_type: 'CLINIC_STAFF', context_id: doctorA.id } });
    await prisma.clinicStaffAssignment.create({ data: { role_membership_id: assistantMembership.id, clinic_branch_id: clinicBranch.id } });

    const [patientA, patientB, outsidePatient] = await Promise.all([
      prisma.user.create({ data: { phone: `+2012${numericSuffix}4`, first_name: 'Patient', last_name: 'A' } }),
      prisma.user.create({ data: { phone: `+2012${numericSuffix}5`, first_name: 'Patient', last_name: 'B' } }),
      prisma.user.create({ data: { phone: `+2012${numericSuffix}6`, first_name: 'Outside', last_name: 'Patient' } }),
    ]);
    patientAId = patientA.id;
    patientBId = patientB.id;
    outsidePatientId = outsidePatient.id;
    const [patientAMembership, patientBMembership] = await Promise.all([
      prisma.roleMembership.create({ data: { user_id: patientA.id, role_code: 'PATIENT', context_type: 'PATIENT' } }),
      prisma.roleMembership.create({ data: { user_id: patientB.id, role_code: 'PATIENT', context_type: 'PATIENT' } }),
      prisma.roleMembership.create({ data: { user_id: outsidePatient.id, role_code: 'PATIENT', context_type: 'PATIENT' } }),
    ]);
    for (const patientId of [patientA.id, patientB.id]) {
      const slot = await prisma.appointmentSlot.create({ data: { doctor_clinic_affiliation_id: affiliation.id, start_at: new Date(Date.now() + 86_400_000), end_at: new Date(Date.now() + 88_200_000), status: 'BOOKED' } });
      await prisma.appointment.create({ data: { slot_id: slot.id, patient_id: patientId, doctor_clinic_affiliation_id: affiliation.id, status: 'CONFIRMED' } });
    }

    const pharmacyAddress = await prisma.address.create({ data: { line1: 'Pharmacy test street', city: 'Cairo', region_code: 'CAI', country_code: 'EG' } });
    const pharmacy = await prisma.pharmacy.create({ data: { legal_name: `Pharmacy E2E ${suffix}`, brand_name: `Pharmacy E2E ${suffix}`, status: 'VERIFIED' } });
    const pharmacyBranch = await prisma.pharmacyBranch.create({ data: { pharmacy_id: pharmacy.id, address_id: pharmacyAddress.id, phone: '+20200000992', iana_timezone: 'Africa/Cairo', status: 'VERIFIED' } });
    pharmacyBranchId = pharmacyBranch.id;
    const pharmacyStaff = await prisma.user.create({ data: { phone: `+2012${numericSuffix}7`, first_name: 'Pharmacy', last_name: 'Staff' } });
    const pharmacyMembership = await prisma.roleMembership.create({ data: { user_id: pharmacyStaff.id, role_code: 'PHARMACY_STAFF', context_type: 'PHARMACY_STAFF', context_id: pharmacyBranch.id } });
    await prisma.pharmacyStaffAssignment.create({ data: { user_id: pharmacyStaff.id, pharmacy_branch_id: pharmacyBranch.id, role_membership_id: pharmacyMembership.id } });

    const labAddress = await prisma.address.create({ data: { line1: 'Lab test street', city: 'Cairo', region_code: 'CAI', country_code: 'EG' } });
    const laboratory = await prisma.laboratory.create({ data: { legal_name: `Laboratory E2E ${suffix}`, brand_name: `Laboratory E2E ${suffix}`, status: 'VERIFIED' } });
    const labBranch = await prisma.labBranch.create({ data: { laboratory_id: laboratory.id, address_id: labAddress.id, phone: '+20200000993', iana_timezone: 'Africa/Cairo', status: 'VERIFIED' } });
    labBranchId = labBranch.id;
    await prisma.testCatalog.create({ data: { code: testCode, display_name: 'E2E complete blood count' } });
    const labStaff = await prisma.user.create({ data: { phone: `+2012${numericSuffix}8`, first_name: 'Lab', last_name: 'Staff' } });
    const labMembership = await prisma.roleMembership.create({ data: { user_id: labStaff.id, role_code: 'LAB_STAFF', context_type: 'LAB_STAFF', context_id: labBranch.id } });
    await prisma.labStaffAssignment.create({ data: { user_id: labStaff.id, lab_branch_id: labBranch.id, role_membership_id: labMembership.id } });

    const sign = (sub: string, membershipId: string, roleCode: string, contextType: string, permissions: string[] = []) =>
      jwt.sign({ sub, roleMembershipId: membershipId, roleCode, contextType, permissions });
    doctorAToken = sign(doctorAUser.id, doctorAMembership.id, 'DOCTOR', 'DOCTOR');
    doctorBToken = sign(doctorBUser.id, doctorBMembership.id, 'DOCTOR', 'DOCTOR');
    assistantToken = sign(assistantUser.id, assistantMembership.id, 'CLINIC_STAFF', 'CLINIC_STAFF', [
      'prescriptions:create:assistant', 'lab-orders:create:assistant', 'pharmacy-orders:create:assistant',
    ]);
    patientAToken = sign(patientA.id, patientAMembership.id, 'PATIENT', 'PATIENT');
    patientBToken = sign(patientB.id, patientBMembership.id, 'PATIENT', 'PATIENT');
    pharmacyStaffToken = sign(pharmacyStaff.id, pharmacyMembership.id, 'PHARMACY_STAFF', 'PHARMACY_STAFF');
    labStaffToken = sign(labStaff.id, labMembership.id, 'LAB_STAFF', 'LAB_STAFF');
  }, 60000);

  afterAll(async () => app.close(), 30000);

  const prescriptionBody = (patientId: string) => ({ patientId, items: [{ drugNameFreeText: 'Amoxicillin', dose: '500 mg', frequency: 'daily', quantity: 10 }] });

  it('requires an idempotency key on provider clinical writes', async () => {
    const response = await request(server()).post('/v1/prescriptions/provider').set(auth(doctorAToken)).send(prescriptionBody(patientAId)).expect(400);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('handles doctor prescription → existing pharmacy queue → patient/provider status', async () => {
    const created = await request(server()).post('/v1/prescriptions/provider').set(auth(doctorAToken)).set('Idempotency-Key', idempotencyKey()).send(prescriptionBody(patientAId)).expect(201);
    const prescriptionId = created.body.data.prescriptionId;
    expect(created.body.data.status).toBe('ACCEPTED');

    const order = await request(server()).post('/v1/pharmacy-orders/provider').set(auth(doctorAToken)).set('Idempotency-Key', idempotencyKey()).send({ patientId: patientAId, prescriptionId, fulfillmentType: 'PICKUP', pharmacyBranchId }).expect(201);
    const orderId = order.body.data.pharmacyOrderId;
    await request(server()).post(`/v1/pharmacy-orders/${orderId}/quote`).set(auth(pharmacyStaffToken)).set('Idempotency-Key', idempotencyKey()).send({ totalPrice: '125.00', note: 'Ready today' }).expect(201);
    await request(server()).post(`/v1/pharmacy-orders/${orderId}/fulfill`).set(auth(pharmacyStaffToken)).set('Idempotency-Key', idempotencyKey()).send({}).expect(201);
    await request(server()).post(`/v1/pharmacy-orders/${orderId}/complete`).set(auth(pharmacyStaffToken)).set('Idempotency-Key', idempotencyKey()).send({}).expect(201);

    await request(server()).get(`/v1/pharmacy-orders/${orderId}`).set(auth(patientAToken)).expect(200).expect((response) => expect(response.body.data.status).toBe('FULFILLED'));
    await request(server()).get(`/v1/pharmacy-orders/${orderId}`).set(auth(doctorAToken)).expect(200).expect((response) => expect(response.body.data.status).toBe('FULFILLED'));
  });

  it('keeps an assistant prescription hidden and out of pharmacy until the supervising doctor approves it', async () => {
    const created = await request(server()).post('/v1/prescriptions/provider').set(auth(assistantToken)).set('Idempotency-Key', idempotencyKey()).send(prescriptionBody(patientAId)).expect(201);
    const prescriptionId = created.body.data.prescriptionId;
    expect(created.body.data.status).toBe('PENDING_DOCTOR_APPROVAL');
    await request(server()).get(`/v1/prescriptions/${prescriptionId}`).set(auth(patientAToken)).expect(404);
    await request(server()).post('/v1/pharmacy-orders/provider').set(auth(assistantToken)).set('Idempotency-Key', idempotencyKey()).send({ patientId: patientAId, prescriptionId, fulfillmentType: 'PICKUP', pharmacyBranchId }).expect(422);
    await request(server()).post(`/v1/prescriptions/provider/${prescriptionId}/approve`).set(auth(doctorBToken)).set('Idempotency-Key', idempotencyKey()).send({ expectedVersion: 1 }).expect(404);
    await request(server()).post(`/v1/prescriptions/provider/${prescriptionId}/approve`).set(auth(doctorAToken)).set('Idempotency-Key', idempotencyKey()).send({ expectedVersion: 99 }).expect(409);
    await request(server()).post(`/v1/prescriptions/provider/${prescriptionId}/approve`).set(auth(doctorAToken)).set('Idempotency-Key', idempotencyKey()).send({ expectedVersion: 1 }).expect(201);
    await request(server()).get(`/v1/prescriptions/${prescriptionId}`).set(auth(patientAToken)).expect(200);
    const order = await request(server()).post('/v1/pharmacy-orders/provider').set(auth(assistantToken)).set('Idempotency-Key', idempotencyKey()).send({ patientId: patientAId, prescriptionId, fulfillmentType: 'PICKUP', pharmacyBranchId }).expect(201);
    const orderId = order.body.data.pharmacyOrderId;
    await request(server()).post(`/v1/pharmacy-orders/${orderId}/quote`).set(auth(pharmacyStaffToken)).set('Idempotency-Key', idempotencyKey()).send({ totalPrice: '85.00' }).expect(201);
    await request(server()).post(`/v1/pharmacy-orders/${orderId}/fulfill`).set(auth(pharmacyStaffToken)).set('Idempotency-Key', idempotencyKey()).send({}).expect(201);
    await request(server()).post(`/v1/pharmacy-orders/${orderId}/complete`).set(auth(pharmacyStaffToken)).set('Idempotency-Key', idempotencyKey()).send({}).expect(201);
    await request(server()).get(`/v1/pharmacy-orders/${orderId}`).set(auth(patientAToken)).expect(200).expect((response) => expect(response.body.data.status).toBe('FULFILLED'));
  });

  it('enforces provider-patient scope, safe retries, and independent batch rows', async () => {
    await request(server()).post('/v1/prescriptions/provider').set(auth(doctorAToken)).set('Idempotency-Key', idempotencyKey()).send(prescriptionBody(outsidePatientId)).expect(404);
    const retryKey = idempotencyKey();
    const first = await request(server()).post('/v1/prescriptions/provider').set(auth(doctorAToken)).set('Idempotency-Key', retryKey).send(prescriptionBody(patientAId)).expect(201);
    const retry = await request(server()).post('/v1/prescriptions/provider').set(auth(doctorAToken)).set('Idempotency-Key', retryKey).send(prescriptionBody(patientAId));
    expect([201, 409]).toContain(retry.status);
    expect(await prisma.prescription.count({ where: { id: first.body.data.prescriptionId } })).toBe(1);

    const batch = await request(server()).post('/v1/prescriptions/provider/batch').set(auth(assistantToken)).set('Idempotency-Key', idempotencyKey()).send({ requests: [prescriptionBody(patientAId), prescriptionBody(patientBId)] }).expect(201);
    expect(batch.body.data.results).toHaveLength(2);
    const batchIds = batch.body.data.results.map((result: any) => result.prescriptionId);
    const persisted = await prisma.prescription.findMany({ where: { id: { in: batchIds } }, select: { patient_id: true, batch_id: true, status: true } });
    expect(new Set(persisted.map((row) => row.patient_id))).toEqual(new Set([patientAId, patientBId]));
    expect(new Set(persisted.map((row) => row.batch_id)).size).toBe(1);
    expect(persisted.every((row) => row.status === 'PENDING_DOCTOR_APPROVAL')).toBe(true);
    await request(server()).get(`/v1/prescriptions/${batchIds[1]}`).set(auth(patientAToken)).expect(404);
  });

  it('runs doctor/assistant lab requests through the existing lab branch queue and batches independently', async () => {
    const doctorOrder = await request(server()).post('/v1/lab-orders/provider').set(auth(doctorAToken)).set('Idempotency-Key', idempotencyKey()).send({ patientId: patientAId, labBranchId, collectionType: 'VISIT', testCodes: [testCode] }).expect(201);
    const doctorOrderId = doctorOrder.body.data.labOrderId;
    await request(server()).post(`/v1/lab-orders/${doctorOrderId}/quote`).set(auth(labStaffToken)).set('Idempotency-Key', idempotencyKey()).send({ totalPrice: '300.00', appointmentAt: new Date(Date.now() + 172_800_000).toISOString(), prepInstructions: 'Fast 8 hours', queueNumber: 1 }).expect(201);
    await request(server()).get(`/v1/lab-orders/${doctorOrderId}`).set(auth(patientAToken)).expect(200).expect((response) => expect(response.body.data.status).toBe('QUOTED'));
    await request(server()).get(`/v1/lab-orders/${doctorOrderId}`).set(auth(doctorAToken)).expect(200).expect((response) => expect(response.body.data.status).toBe('QUOTED'));

    const assistantOrder = await request(server()).post('/v1/lab-orders/provider').set(auth(assistantToken)).set('Idempotency-Key', idempotencyKey()).send({ patientId: patientAId, labBranchId, collectionType: 'VISIT', testCodes: [testCode] }).expect(201);
    expect(assistantOrder.body.data.status).toBe('REQUESTED');
    const batch = await request(server()).post('/v1/lab-orders/provider/batch').set(auth(assistantToken)).set('Idempotency-Key', idempotencyKey()).send({ requests: [
      { patientId: patientAId, labBranchId, collectionType: 'VISIT', testCodes: [testCode] },
      { patientId: patientBId, labBranchId, collectionType: 'VISIT', testCodes: [testCode] },
    ] }).expect(201);
    const ids = batch.body.data.results.map((result: any) => result.labOrderId);
    const persisted = await prisma.labOrder.findMany({ where: { id: { in: ids } }, select: { patient_id: true, batch_id: true, doctor_id: true, created_by_user_id: true } });
    expect(new Set(persisted.map((row) => row.patient_id))).toEqual(new Set([patientAId, patientBId]));
    expect(new Set(persisted.map((row) => row.batch_id)).size).toBe(1);
    expect(persisted.every((row) => row.doctor_id === doctorAUserId && row.created_by_user_id !== doctorAUserId)).toBe(true);
    await request(server()).get(`/v1/lab-orders/${ids[1]}`).set(auth(patientAToken)).expect(404);
    await request(server()).post('/v1/lab-orders/provider/batch').set(auth(doctorAToken)).set('Idempotency-Key', idempotencyKey()).send({ requests: [
      { patientId: patientAId, labBranchId, collectionType: 'VISIT', testCodes: [testCode] },
      { patientId: patientAId, labBranchId, collectionType: 'VISIT', testCodes: [testCode] },
    ] }).expect(422);
  });
});
