import { OrderPrescriptionAccessUseCase } from './order-prescription-access.use-case';
import { GetPrescriptionUseCase } from '../../prescriptions/application/get-prescription.use-case';
import { ReviewPrescriptionUseCase } from '../../prescriptions/application/review-prescription.use-case';
import { PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';
import { PrescriptionRepository } from '../../prescriptions/infrastructure/prescription.repository';

describe('OrderPrescriptionAccessUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'membership-1', contextType: 'PHARMACY_STAFF', permissions: [] } as any;
  const order = { id: 'order-1', status: 'RECEIVED', pharmacy_branch_id: null, prescription_id: 'rx-1' };
  const prescription = { id: 'rx-1', version: 1, patient_id: 'patient-1', source: 'PATIENT_UPLOADED', document_type: 'PRESCRIPTION', status: 'QUALITY_CHECK_PASSED', notes: null };

  function setup() {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([]) } as any;
    const prisma = { $transaction: jest.fn((fn) => fn(tx)) } as any;
    const orders = { findById: jest.fn().mockResolvedValue(order), lockForPrescriptionAccess: jest.fn((db, id) => new PharmacyOrderRepository().lockForPrescriptionAccess(db, id)) };
    const broadcasts = { findByOrderAndBranch: jest.fn().mockResolvedValue({ response: null }) };
    const memberships = { executeByRoleMembershipId: jest.fn().mockResolvedValue({ roleMembershipId: 'membership-1', contextId: 'branch-1' }) };
    const prescriptions = { findById: jest.fn().mockResolvedValue(prescription), setStatus: jest.fn(), lockForReview: jest.fn((db, id) => new PrescriptionRepository().lockForReview(db, id)) };
    const images = { findByPrescriptionId: jest.fn().mockResolvedValue([{ id: 'image-1', file_url: 'https://private.example/rx.png', quality_check_status: 'PASSED' }]) };
    const items = { findByPrescriptionId: jest.fn().mockResolvedValue([]), createReviewed: jest.fn() };
    const reviews = { findByPrescriptionId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 'review-1' }) };
    const storage = { getSignedUrl: jest.fn((url) => `${url}?signed`) };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const reader = new GetPrescriptionUseCase(prisma, prescriptions as any, images as any, items as any, reviews as any, storage as any);
    const reviewer = new ReviewPrescriptionUseCase(prisma, prescriptions as any, items as any, reviews as any, {} as any, audit as any, outbox as any);
    const useCase = new OrderPrescriptionAccessUseCase(prisma, orders as any, broadcasts as any, memberships as any, reader, reviewer);
    return { tx, orders, broadcasts, memberships, prescriptions, images, items, reviews, storage, audit, outbox, useCase };
  }

  it.each(['get', 'review'] as const)('allows pending unanswered broadcast to own branch for %s', async (method) => {
    const { tx, memberships, storage, prescriptions, useCase } = setup();
    if (method === 'get') {
      await expect(useCase.get('order-1', actor)).resolves.toMatchObject({ prescriptionId: 'rx-1' });
      expect(storage.getSignedUrl).toHaveBeenCalledTimes(1);
    } else {
      await expect(useCase.review('order-1', { decision: 'ACCEPTED' }, actor)).resolves.toEqual({ status: 'ACCEPTED' });
      expect(prescriptions.setStatus).toHaveBeenCalledWith(tx, 'rx-1', 1, 'ACCEPTED');
    }
    expect(memberships.executeByRoleMembershipId).toHaveBeenCalledWith('membership-1', 'PHARMACY_STAFF');
    expect(tx.$queryRaw.mock.calls[0][0].join('?')).toContain('FROM pharmacy_orders');
  });

  it('allows already claimed own-branch order without requiring a pending broadcast', async () => {
    const { orders, broadcasts, useCase } = setup();
    orders.findById.mockResolvedValue({ ...order, status: 'ACCEPTED', pharmacy_branch_id: 'branch-1' } as any);
    await expect(useCase.get('order-1', actor)).resolves.toMatchObject({ prescriptionId: 'rx-1' });
    expect(broadcasts.findByOrderAndBranch).not.toHaveBeenCalled();
  });

  it.each(['other_claim', 'no_broadcast', 'declined', 'timeout', 'unavailable', 'revoked', 'suspended', 'missing', 'wrong_role'])('%s blocks both read and review with 404 before signing or writing', async (state) => {
    const { orders, broadcasts, memberships, prescriptions, images, items, reviews, storage, audit, outbox, useCase } = setup();
    if (state === 'other_claim') orders.findById.mockResolvedValue({ ...order, pharmacy_branch_id: 'branch-2' } as any);
    if (state === 'unavailable') orders.findById.mockResolvedValue({ ...order, status: 'CANCELLED' } as any);
    if (state === 'missing') orders.findById.mockResolvedValue(null as any);
    if (state === 'no_broadcast') broadcasts.findByOrderAndBranch.mockResolvedValue(null as any);
    if (state === 'declined' || state === 'timeout') broadcasts.findByOrderAndBranch.mockResolvedValue({ response: state.toUpperCase() } as any);
    // Membership lookup is live and returns null for revoked memberships or suspended users.
    if (state === 'revoked' || state === 'suspended') memberships.executeByRoleMembershipId.mockResolvedValue(null);
    const caller = state === 'wrong_role' ? { ...actor, contextType: 'PATIENT' } : actor;
    await expect(useCase.get('order-1', caller)).rejects.toMatchObject({ httpStatus: 404 });
    await expect(useCase.review('order-1', { decision: 'ACCEPTED' }, caller)).rejects.toMatchObject({ httpStatus: 404 });
    expect(prescriptions.findById).not.toHaveBeenCalled();
    expect(images.findByPrescriptionId).not.toHaveBeenCalled();
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
    expect(reviews.create).not.toHaveBeenCalled();
    expect(items.createReviewed).not.toHaveBeenCalled();
    expect(prescriptions.setStatus).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(outbox.emit).not.toHaveBeenCalled();
  });

  it.each(['PENDING_DOCTOR_APPROVAL', 'REJECTED', 'QUALITY_CHECK_FAILED'])('order-scoped review cannot bypass the prescription state guard: %s', async (status) => {
    const { prescriptions, reviews, useCase } = setup();
    prescriptions.findById.mockResolvedValue({ ...prescription, status });
    await expect(useCase.review('order-1', { decision: 'ACCEPTED' }, actor)).rejects.toMatchObject({ code: 'PRESCRIPTION_NOT_REVIEWABLE' });
    expect(reviews.create).not.toHaveBeenCalled();
  });
});
