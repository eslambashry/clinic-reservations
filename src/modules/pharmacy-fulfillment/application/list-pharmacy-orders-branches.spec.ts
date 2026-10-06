import { ForbiddenError } from '../../../shared/core/errors/domain-errors';
import { ListPharmacyOrdersUseCase } from './list-pharmacy-orders.use-case';

const patient = { id: 'pt', firstName: 'Sara', lastName: 'Ali', phoneMasked: '***1' };
const prescription = { id: 'rx', source: 'DOCTOR_ISSUED', status: 'ACCEPTED', expiresAt: null, doctorId: null, images: [] };

function row(id: string, createdAt: string) {
  return {
    id, status: 'RECEIVED', fulfillment_type: 'PICKUP', patient_id: 'pt', prescription_id: 'rx',
    created_at: new Date(createdAt), updated_at: new Date(createdAt), total_price: null, currency: null,
    estimated_ready_minutes: null, staff_note: null, quoted_at: null, rejection_reason: null, rejection_note: null, rejected_at: null,
  };
}

function setup() {
  const pharmacyOrders = { findForPatient: jest.fn().mockResolvedValue([]), findForBranch: jest.fn().mockResolvedValue([]), findForDoctor: jest.fn().mockResolvedValue([]) };
  const membership = { executeByRoleMembershipId: jest.fn() };
  const userSummary = { execute: jest.fn().mockResolvedValue(patient) };
  const rxSummary = { execute: jest.fn().mockResolvedValue(prescription) };
  const scope = { execute: jest.fn().mockResolvedValue({ doctorUserId: 'doc' }) };
  const useCase = new ListPharmacyOrdersUseCase({} as any, pharmacyOrders as any, membership as any, userSummary as any, rxSummary as any, scope as any);
  return { pharmacyOrders, membership, userSummary, rxSummary, scope, useCase };
}

describe('ListPharmacyOrdersUseCase additional branches', () => {
  it('sorts ascending and caps the limit at 50', async () => {
    const { pharmacyOrders, useCase } = setup();
    await useCase.execute({ sort: 'createdAt:asc', limit: 500 }, { sub: 'pt', contextType: 'PATIENT' } as any);
    expect(pharmacyOrders.findForPatient).toHaveBeenCalledWith(expect.anything(), 'pt', expect.objectContaining({ sortDirection: 'asc', limit: 51 }));
  });

  it('forbids pharmacy staff without an active branch membership', async () => {
    const { membership, useCase } = setup();
    const actor = { sub: 's', roleMembershipId: 'm', contextType: 'PHARMACY_STAFF' } as any;
    membership.executeByRoleMembershipId.mockResolvedValue(null);
    await expect(useCase.execute({}, actor)).rejects.toBeInstanceOf(ForbiddenError);
    membership.executeByRoleMembershipId.mockResolvedValue({ contextId: null });
    await expect(useCase.execute({}, actor)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lists the branch queue for staff with a membership', async () => {
    const { membership, pharmacyOrders, useCase } = setup();
    membership.executeByRoleMembershipId.mockResolvedValue({ contextId: 'branch-1' });
    await useCase.execute({}, { sub: 's', roleMembershipId: 'm', contextType: 'PHARMACY_STAFF' } as any);
    expect(pharmacyOrders.findForBranch).toHaveBeenCalledWith(expect.anything(), 'branch-1', expect.anything());
  });

  it('forbids other roles', async () => {
    const { useCase } = setup();
    await expect(useCase.execute({}, { sub: 'a', contextType: 'ADMIN' } as any)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('scopes doctor listing without creator filter and assistants to their own submissions', async () => {
    const { pharmacyOrders, useCase } = setup();
    await useCase.execute({}, { sub: 'doc', contextType: 'DOCTOR' } as any);
    expect(pharmacyOrders.findForDoctor).toHaveBeenLastCalledWith(expect.anything(), 'doc', expect.anything(), undefined);
    await useCase.execute({}, { sub: 'asst', contextType: 'CLINIC_STAFF' } as any);
    expect(pharmacyOrders.findForDoctor).toHaveBeenLastCalledWith(expect.anything(), 'doc', expect.anything(), 'asst');
  });

  it('paginates: returns nextCursor when more rows than limit', async () => {
    const { pharmacyOrders, useCase } = setup();
    pharmacyOrders.findForPatient.mockResolvedValue([row('o1', '2026-01-03T00:00:00Z'), row('o2', '2026-01-02T00:00:00Z')]);
    const result = await useCase.execute({ limit: 1 }, { sub: 'pt', contextType: 'PATIENT' } as any);
    expect(result.orders).toHaveLength(1);
    expect(result.nextCursor).not.toBeNull();
  });

  it('throws when enrichment data is missing', async () => {
    const { pharmacyOrders, userSummary, useCase } = setup();
    pharmacyOrders.findForPatient.mockResolvedValue([row('o1', '2026-01-03T00:00:00Z')]);
    userSummary.execute.mockResolvedValue(null);
    await expect(useCase.execute({}, { sub: 'pt', contextType: 'PATIENT' } as any)).rejects.toThrow(/missing patient or prescription/);
  });

  it('resolves the issuing doctor name, and null when the doctor is gone', async () => {
    const { pharmacyOrders, userSummary, rxSummary, useCase } = setup();
    pharmacyOrders.findForPatient.mockResolvedValue([row('o1', '2026-01-03T00:00:00Z')]);
    rxSummary.execute.mockResolvedValue({ ...prescription, doctorId: 'doc' });
    userSummary.execute.mockImplementation(async (_db: any, id: string) => (id === 'doc' ? { firstName: 'Omar', lastName: null } : patient));
    const named = await useCase.execute({}, { sub: 'pt', contextType: 'PATIENT' } as any);
    expect(JSON.stringify(named.orders[0])).toContain('Omar');
    userSummary.execute.mockImplementation(async (_db: any, id: string) => (id === 'doc' ? null : patient));
    await expect(useCase.execute({}, { sub: 'pt', contextType: 'PATIENT' } as any)).resolves.toBeDefined();
  });
});
