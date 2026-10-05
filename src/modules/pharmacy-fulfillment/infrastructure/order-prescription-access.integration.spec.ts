import { PrismaClient, PrescriptionDocumentType, PrescriptionSource, PrescriptionStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { OrderPrescriptionAccessUseCase } from '../application/order-prescription-access.use-case';
import { PharmacyOrderRepository } from './pharmacy-order.repository';
import { PharmacyOrderBroadcastRepository } from './pharmacy-order-broadcast.repository';
import { GetPrescriptionUseCase } from '../../prescriptions/application/get-prescription.use-case';
import { ReviewPrescriptionUseCase } from '../../prescriptions/application/review-prescription.use-case';
import { PrescriptionRepository } from '../../prescriptions/infrastructure/prescription.repository';
import { PrescriptionImageRepository } from '../../prescriptions/infrastructure/prescription-image.repository';
import { PrescriptionItemRepository } from '../../prescriptions/infrastructure/prescription-item.repository';
import { PrescriptionReviewRepository } from '../../prescriptions/infrastructure/prescription-review.repository';
import { DrugCatalogRepository } from '../../prescriptions/infrastructure/drug-catalog.repository';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { RoleMembershipRepository } from '../../identity-auth/infrastructure/role-membership.repository';
import { AuditService } from '../../audit/application/audit.service';
import { AuditLogRepository } from '../../audit/infrastructure/audit-log.repository';
import { RequestContextService } from '../../../shared/core/context/request-context.service';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';

/** Real database/repositories and live staff memberships; only the external media signer is a fixture. */
describe('branch order prescription access (real PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  const suffix = randomUUID();
  const prescriptionIds: string[] = [];
  const userIds: string[] = [];
  const branchIds: string[] = [];
  let pharmacyId: string;
  let addressId: string;
  let patientId: string;
  let doctorUserId: string;
  let assistantUserId: string;
  let firstStaff: AccessTokenPayload;
  let secondStaff: AccessTokenPayload;
  let access: OrderPrescriptionAccessUseCase;
  let reader: GetPrescriptionUseCase;
  const signer = { getSignedUrl: jest.fn((url: string) => `${url}?fixture-signature`) };

  beforeAll(async () => {
    await prisma.role.upsert({ where: { code: 'PHARMACY_STAFF' }, update: {}, create: { code: 'PHARMACY_STAFF', name: 'Pharmacy staff fixture' } });
    const address = await prisma.address.create({ data: { line1: 'Branch access fixture', city: 'Cairo', region_code: 'CAI', country_code: 'EG' } });
    addressId = address.id;
    const pharmacy = await prisma.pharmacy.create({ data: { legal_name: `Access ${suffix}`, brand_name: 'Access fixture', status: 'VERIFIED' } });
    pharmacyId = pharmacy.id;
    const actors: AccessTokenPayload[] = [];
    for (let index = 0; index < 2; index++) {
      const branch = await prisma.pharmacyBranch.create({ data: { pharmacy_id: pharmacyId, address_id: addressId, phone: '+201000000000', iana_timezone: 'Africa/Cairo', status: 'VERIFIED' } });
      branchIds.push(branch.id);
      const user = await prisma.user.create({ data: { phone: `fixture-staff-${suffix}-${index}` } });
      userIds.push(user.id);
      const membership = await prisma.roleMembership.create({ data: { user_id: user.id, role_code: 'PHARMACY_STAFF', context_type: 'PHARMACY_STAFF', context_id: branch.id } });
      actors.push({ sub: user.id, roleMembershipId: membership.id, roleCode: 'PHARMACY_STAFF', contextType: 'PHARMACY_STAFF', permissions: [] });
    }
    [firstStaff, secondStaff] = actors;
    for (const role of ['patient', 'doctor', 'assistant']) {
      const user = await prisma.user.create({ data: { phone: `fixture-${role}-${suffix}` } });
      userIds.push(user.id);
      if (role === 'patient') patientId = user.id;
      if (role === 'doctor') doctorUserId = user.id;
      if (role === 'assistant') assistantUserId = user.id;
    }
    const prescriptions = new PrescriptionRepository();
    const images = new PrescriptionImageRepository();
    const items = new PrescriptionItemRepository();
    const reviews = new PrescriptionReviewRepository();
    reader = new GetPrescriptionUseCase(prisma as any, prescriptions, images, items, reviews, signer as any);
    const reviewer = new ReviewPrescriptionUseCase(prisma as any, prescriptions, items, reviews, new DrugCatalogRepository(), new AuditService(new AuditLogRepository(), new RequestContextService()), new OutboxService());
    const memberships = new GetActiveRoleMembershipUseCase(prisma as any, new RoleMembershipRepository());
    access = new OrderPrescriptionAccessUseCase(prisma as any, new PharmacyOrderRepository(), new PharmacyOrderBroadcastRepository(), memberships, reader, reviewer);
  });

  beforeEach(async () => {
    signer.getSignedUrl.mockClear();
    await prisma.user.update({ where: { id: firstStaff.sub }, data: { status: 'ACTIVE', deleted_at: null } });
    await prisma.roleMembership.update({ where: { id: firstStaff.roleMembershipId }, data: { status: 'ACTIVE' } });
  });

  afterAll(async () => {
    const orders = await prisma.pharmacyOrder.findMany({ where: { prescription_id: { in: prescriptionIds } }, select: { id: true } });
    const orderIds = orders.map((order) => order.id);
    await prisma.auditLog.deleteMany({ where: { resource_id: { in: prescriptionIds } } });
    await prisma.outboxEvent.deleteMany({ where: { OR: prescriptionIds.map((id) => ({ payload: { path: ['prescriptionId'], equals: id } })) } });
    await prisma.pharmacyOrderBroadcast.deleteMany({ where: { pharmacy_order_id: { in: orderIds } } });
    await prisma.pharmacyOrder.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.prescriptionReview.deleteMany({ where: { prescription_id: { in: prescriptionIds } } });
    await prisma.prescriptionImage.deleteMany({ where: { prescription_id: { in: prescriptionIds } } });
    await prisma.prescriptionItem.deleteMany({ where: { prescription_id: { in: prescriptionIds } } });
    await prisma.prescription.deleteMany({ where: { id: { in: prescriptionIds } } });
    await prisma.roleMembership.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.pharmacyBranch.deleteMany({ where: { id: { in: branchIds } } });
    if (pharmacyId) await prisma.pharmacy.delete({ where: { id: pharmacyId } });
    if (addressId) await prisma.address.delete({ where: { id: addressId } });
    await prisma.$disconnect();
  });

  async function fixture(overrides: { source?: PrescriptionSource; status?: PrescriptionStatus; documentType?: PrescriptionDocumentType } = {}) {
    const source = overrides.source ?? 'PATIENT_UPLOADED';
    const prescription = await prisma.prescription.create({ data: {
      patient_id: patientId, source, document_type: overrides.documentType ?? 'PRESCRIPTION', status: overrides.status ?? 'QUALITY_CHECK_PASSED',
      ...(source === 'DOCTOR_ISSUED' ? { doctor_id: doctorUserId, created_by_user_id: assistantUserId, created_by_role: 'CLINIC_STAFF' } : {}),
    } });
    prescriptionIds.push(prescription.id);
    await prisma.prescriptionImage.create({ data: { prescription_id: prescription.id, file_url: `https://private.example.invalid/${prescription.id}.png`, quality_check_status: 'PASSED' } });
    const order = await prisma.pharmacyOrder.create({ data: { prescription_id: prescription.id, patient_id: patientId, fulfillment_type: 'PICKUP' } });
    const broadcast = await prisma.pharmacyOrderBroadcast.create({ data: { pharmacy_order_id: order.id, pharmacy_branch_id: branchIds[0] } });
    return { prescription, order, broadcast };
  }

  async function assertNoReviewEffects(prescriptionId: string, status: PrescriptionStatus = 'QUALITY_CHECK_PASSED') {
    expect(await prisma.prescriptionReview.count({ where: { prescription_id: prescriptionId } })).toBe(0);
    expect(await prisma.prescriptionItem.count({ where: { prescription_id: prescriptionId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { resource_id: prescriptionId } })).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { payload: { path: ['prescriptionId'], equals: prescriptionId } } })).toBe(0);
    expect(await prisma.prescription.findUnique({ where: { id: prescriptionId } })).toMatchObject({ status, version: 1 });
  }

  it('reads an unanswered own-branch broadcast and performs a persisted legitimate patient review', async () => {
    const { prescription, order } = await fixture();
    await expect(access.get(order.id, firstStaff)).resolves.toMatchObject({ prescriptionId: prescription.id, images: [expect.objectContaining({ fileUrl: expect.stringContaining('fixture-signature') })] });
    expect(signer.getSignedUrl).toHaveBeenCalledTimes(1);
    await expect(access.review(order.id, { decision: 'ACCEPTED' }, firstStaff)).resolves.toEqual({ status: 'ACCEPTED' });
    expect(await prisma.prescriptionReview.findFirst({ where: { prescription_id: prescription.id } })).toMatchObject({ pharmacist_user_id: firstStaff.sub, decision: 'ACCEPTED' });
    expect(await prisma.prescription.findUnique({ where: { id: prescription.id } })).toMatchObject({ status: 'ACCEPTED', version: 2 });
    expect(await prisma.auditLog.count({ where: { resource_id: prescription.id, action: 'prescriptions.prescription.review' } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { event_name: 'PrescriptionAccepted', payload: { path: ['prescriptionId'], equals: prescription.id } } })).toBe(1);
  });

  it('reads an own claimed order after its broadcast has been accepted', async () => {
    const { prescription, order, broadcast } = await fixture();
    await prisma.pharmacyOrder.update({ where: { id: order.id }, data: { pharmacy_branch_id: branchIds[0], status: 'UNDER_REVIEW' } });
    await prisma.pharmacyOrderBroadcast.update({ where: { id: broadcast.id }, data: { response: 'ACCEPTED' } });
    await expect(access.get(order.id, firstStaff)).resolves.toMatchObject({ prescriptionId: prescription.id });
  });

  it.each(['different_branch', 'declined', 'timeout', 'claimed_elsewhere', 'received_but_claimed_elsewhere', 'revoked', 'suspended', 'deleted_user'])('%s denies reads/reviews without signed links or persisted effects', async (state) => {
    const { prescription, order, broadcast } = await fixture();
    let actor = firstStaff;
    if (state === 'different_branch') actor = secondStaff;
    if (state === 'declined' || state === 'timeout') await prisma.pharmacyOrderBroadcast.update({ where: { id: broadcast.id }, data: { response: state === 'declined' ? 'DECLINED' : 'TIMEOUT' } });
    if (state === 'claimed_elsewhere' || state === 'received_but_claimed_elsewhere') await prisma.pharmacyOrder.update({ where: { id: order.id }, data: { pharmacy_branch_id: branchIds[1], status: state === 'claimed_elsewhere' ? 'UNDER_REVIEW' : 'RECEIVED' } });
    if (state === 'revoked') await prisma.roleMembership.update({ where: { id: firstStaff.roleMembershipId }, data: { status: 'REVOKED' } });
    if (state === 'suspended') await prisma.user.update({ where: { id: firstStaff.sub }, data: { status: 'SUSPENDED' } });
    if (state === 'deleted_user') await prisma.user.update({ where: { id: firstStaff.sub }, data: { deleted_at: new Date() } });
    await expect(access.get(order.id, actor)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', httpStatus: 404 });
    await expect(access.review(order.id, { decision: 'ACCEPTED' }, actor)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', httpStatus: 404 });
    expect(signer.getSignedUrl).not.toHaveBeenCalled();
    await assertNoReviewEffects(prescription.id);
  });

  it('the trusted order accessor does not reopen global pharmacy prescription access', async () => {
    const { prescription } = await fixture();
    await expect(reader.execute(prescription.id, firstStaff)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', httpStatus: 404 });
    expect(signer.getSignedUrl).not.toHaveBeenCalled();
  });

  it.each([
    { source: 'DOCTOR_ISSUED', status: 'PENDING_DOCTOR_APPROVAL', documentType: 'PRESCRIPTION' },
    { source: 'DOCTOR_ISSUED', status: 'ACCEPTED', documentType: 'PRESCRIPTION' },
    { source: 'DOCTOR_ISSUED', status: 'QUALITY_CHECK_FAILED', documentType: 'PRESCRIPTION' },
    { source: 'DOCTOR_ISSUED', status: 'QUALITY_CHECK_PASSED', documentType: 'LAB_REFERRAL' },
    { source: 'PATIENT_UPLOADED', status: 'QUALITY_CHECK_FAILED', documentType: 'PRESCRIPTION' },
    { source: 'PATIENT_UPLOADED', status: 'REJECTED', documentType: 'PRESCRIPTION' },
    { source: 'PATIENT_UPLOADED', status: 'ACCEPTED', documentType: 'PRESCRIPTION' },
  ] as { source: PrescriptionSource; status: PrescriptionStatus; documentType: PrescriptionDocumentType }[])('even an own-branch order cannot authorize pharmacy acceptance of $source/$documentType/$status', async (state) => {
    // Deliberately malformed fixtures exercise defense even if an order incorrectly references a draft/referral.
    const { prescription, order } = await fixture(state);
    await expect(access.review(order.id, { decision: 'ACCEPTED', controlledSubstanceConfirmed: true }, firstStaff))
      .rejects.toMatchObject({ code: 'PRESCRIPTION_NOT_REVIEWABLE', httpStatus: 422 });
    if (state.status === 'PENDING_DOCTOR_APPROVAL' || state.documentType === 'LAB_REFERRAL') {
      await expect(access.get(order.id, firstStaff)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', httpStatus: 404 });
    }
    expect(signer.getSignedUrl).not.toHaveBeenCalled();
    await assertNoReviewEffects(prescription.id, state.status);
  });

  it('clarification remains reviewable until a final decision, which cannot be reopened', async () => {
    const { prescription, order } = await fixture();
    await expect(access.review(order.id, { decision: 'NEEDS_CLARIFICATION' }, firstStaff)).resolves.toEqual({ status: 'QUALITY_CHECK_PASSED' });
    await expect(access.review(order.id, { decision: 'REJECTED' }, firstStaff)).resolves.toEqual({ status: 'REJECTED' });
    await expect(access.review(order.id, { decision: 'ACCEPTED' }, firstStaff)).rejects.toMatchObject({ code: 'PRESCRIPTION_NOT_REVIEWABLE' });
    expect(await prisma.prescriptionReview.count({ where: { prescription_id: prescription.id } })).toBe(2);
    expect(await prisma.outboxEvent.count({ where: { payload: { path: ['prescriptionId'], equals: prescription.id } } })).toBe(1);
  });
});
