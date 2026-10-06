import { LabBranchRepository } from './lab-branch.repository';
import { LabOrderItemRepository } from './lab-order-item.repository';
import { LabOrderNoteRepository } from './lab-order-note.repository';
import { LabResultRepository } from './lab-result.repository';
import { LabStaffAssignmentRepository } from './lab-staff-assignment.repository';
import { LaboratoryRepository } from './laboratory.repository';

const okUpdate = () => jest.fn().mockResolvedValue({ count: 1 });

describe('LaboratoryRepository', () => {
  const repo = new LaboratoryRepository();

  it('create maps camelCase input to columns', async () => {
    const db = { laboratory: { create: jest.fn().mockResolvedValue({ id: 'l' }) } } as any;
    await repo.create(db, { legalName: 'L', brandName: 'B', taxId: 'T', regionCode: 'EG' });
    expect(db.laboratory.create).toHaveBeenCalledWith({
      data: { legal_name: 'L', brand_name: 'B', tax_id: 'T', region_code: 'EG' },
    });
  });

  it('findById / findByIdWithBranches query by id', async () => {
    const db = { laboratory: { findUnique: jest.fn().mockResolvedValue(null) } } as any;
    await repo.findById(db, 'l1');
    expect(db.laboratory.findUnique).toHaveBeenCalledWith({ where: { id: 'l1' } });
    await repo.findByIdWithBranches(db, 'l1');
    expect(db.laboratory.findUnique).toHaveBeenLastCalledWith({
      where: { id: 'l1' },
      include: { branches: { include: { address: true } } },
    });
  });

  it('list in cursor mode builds the keyset filter', async () => {
    const db = { laboratory: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    await repo.list(db, { status: 'VERIFIED', cursor: { createdAt: '2026-01-01T00:00:00.000Z', id: 'x' }, limit: 11 });
    expect(db.laboratory.findMany).toHaveBeenCalledWith({
      where: {
        deleted_at: null,
        status: 'VERIFIED',
        OR: [
          { created_at: { gt: new Date('2026-01-01T00:00:00.000Z') } },
          { created_at: new Date('2026-01-01T00:00:00.000Z'), id: { gt: 'x' } },
        ],
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: 11,
    });
  });

  it('list in offset mode skips the cursor and passes skip', async () => {
    const db = { laboratory: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    await repo.list(db, { cursor: { createdAt: '2026-01-01T00:00:00.000Z', id: 'x' }, limit: 5, skip: 10 });
    expect(db.laboratory.findMany).toHaveBeenCalledWith({
      where: { deleted_at: null },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: 5,
      skip: 10,
    });
  });

  it('count uses the same filter', async () => {
    const db = { laboratory: { count: jest.fn().mockResolvedValue(3) } } as any;
    await expect(repo.count(db, { status: 'PENDING' })).resolves.toBe(3);
    expect(db.laboratory.count).toHaveBeenCalledWith({ where: { deleted_at: null, status: 'PENDING' } });
  });

  it('update only writes provided fields with an optimistic lock', async () => {
    const db = { laboratory: { updateMany: okUpdate() } } as any;
    await repo.update(db, 'l1', 2, { legalName: 'L', brandName: 'B', taxId: 'T', regionCode: 'EG' });
    expect(db.laboratory.updateMany).toHaveBeenCalledWith({
      where: { id: 'l1', version: 2 },
      data: { legal_name: 'L', brand_name: 'B', tax_id: 'T', region_code: 'EG', version: { increment: 1 } },
    });

    db.laboratory.updateMany.mockClear();
    await repo.update(db, 'l1', 2, {});
    expect(db.laboratory.updateMany).toHaveBeenCalledWith({
      where: { id: 'l1', version: 2 },
      data: { version: { increment: 1 } },
    });
  });

  it('update throws on a version conflict', async () => {
    const db = { laboratory: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } } as any;
    await expect(repo.update(db, 'l1', 2, {})).rejects.toThrow();
  });

  it('setStatus stamps verified_at only for VERIFIED', async () => {
    const db = { laboratory: { updateMany: okUpdate() } } as any;
    await repo.setStatus(db, 'l1', 1, 'VERIFIED');
    expect(db.laboratory.updateMany.mock.calls[0][0].data).toEqual({
      status: 'VERIFIED',
      verified_at: expect.any(Date),
      version: { increment: 1 },
    });
    await repo.setStatus(db, 'l1', 1, 'SUSPENDED');
    expect(db.laboratory.updateMany.mock.calls[1][0].data).toEqual({ status: 'SUSPENDED', version: { increment: 1 } });
  });
});

describe('LabBranchRepository', () => {
  const repo = new LabBranchRepository();

  it('reads', async () => {
    const db = { labBranch: { findUnique: jest.fn(), findMany: jest.fn() } } as any;
    await repo.findById(db, 'b1');
    expect(db.labBranch.findUnique).toHaveBeenCalledWith({ where: { id: 'b1' } });
    await repo.findByIdWithRelations(db, 'b1');
    expect(db.labBranch.findUnique).toHaveBeenLastCalledWith({
      where: { id: 'b1' },
      include: { laboratory: true, address: true },
    });
    await repo.findByLaboratoryId(db, 'l1');
    expect(db.labBranch.findMany).toHaveBeenCalledWith({
      where: { laboratory_id: 'l1' },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
  });

  it('create defaults home collection to false and verifies the branch', async () => {
    const db = { labBranch: { create: jest.fn() } } as any;
    await repo.create(db, { laboratoryId: 'l1', addressId: 'a1', phone: 'p', ianaTimezone: 'tz' });
    expect(db.labBranch.create).toHaveBeenCalledWith({
      data: {
        laboratory_id: 'l1',
        address_id: 'a1',
        phone: 'p',
        iana_timezone: 'tz',
        home_collection_capable: false,
        status: 'VERIFIED',
      },
    });
    await repo.create(db, { laboratoryId: 'l1', addressId: 'a1', phone: 'p', ianaTimezone: 'tz', homeCollectionCapable: true });
    expect(db.labBranch.create.mock.calls[1][0].data.home_collection_capable).toBe(true);
  });

  it('update writes only provided fields', async () => {
    const db = { labBranch: { updateMany: okUpdate() } } as any;
    await repo.update(db, 'b1', 3, { phone: 'p', ianaTimezone: 'tz', homeCollectionCapable: false });
    expect(db.labBranch.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', version: 3 },
      data: { phone: 'p', iana_timezone: 'tz', home_collection_capable: false, version: { increment: 1 } },
    });
    await repo.update(db, 'b1', 3, {});
    expect(db.labBranch.updateMany.mock.calls[1][0].data).toEqual({ version: { increment: 1 } });
  });

  it('setStatus writes the status with the lock', async () => {
    const db = { labBranch: { updateMany: okUpdate() } } as any;
    await repo.setStatus(db, 'b1', 3, 'SUSPENDED');
    expect(db.labBranch.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', version: 3 },
      data: { status: 'SUSPENDED', version: { increment: 1 } },
    });
  });
});

describe('LabStaffAssignmentRepository', () => {
  const repo = new LabStaffAssignmentRepository();

  it('acquireProvisioningLock issues an advisory lock query', async () => {
    const db = { $queryRaw: jest.fn().mockResolvedValue([]) } as any;
    await repo.acquireProvisioningLock(db, 'lab-1');
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.$queryRaw.mock.calls[0][0].values).toContain('lab-staff:lab-1');
  });

  it('create upserts keyed on the membership', async () => {
    const db = { labStaffAssignment: { upsert: jest.fn() } } as any;
    await repo.create(db, { userId: 'u', labBranchId: 'b', roleMembershipId: 'rm' });
    expect(db.labStaffAssignment.upsert).toHaveBeenCalledWith({
      where: { role_membership_id: 'rm' },
      create: { user_id: 'u', lab_branch_id: 'b', role_membership_id: 'rm' },
      update: { user_id: 'u', lab_branch_id: 'b' },
    });
  });

  it('findActiveByLaboratoryId maps rows to camelCase', async () => {
    const db = {
      labStaffAssignment: {
        findMany: jest.fn().mockResolvedValue([{ role_membership_id: 'rm', user_id: 'u', lab_branch_id: 'b' }]),
      },
    } as any;
    await expect(repo.findActiveByLaboratoryId(db, 'l1')).resolves.toEqual([
      { roleMembershipId: 'rm', userId: 'u', labBranchId: 'b' },
    ]);
    expect(db.labStaffAssignment.findMany).toHaveBeenCalledWith({
      where: { lab_branch: { laboratory_id: 'l1' }, role_membership: { status: 'ACTIVE' } },
      select: { role_membership_id: true, user_id: true, lab_branch_id: true },
    });
  });

  it('findBranchIdForLaboratory returns the branch id or null', async () => {
    const db = { labStaffAssignment: { findFirst: jest.fn() } } as any;
    db.labStaffAssignment.findFirst.mockResolvedValueOnce({ lab_branch_id: 'b' });
    await expect(repo.findBranchIdForLaboratory(db, { roleMembershipId: 'rm', laboratoryId: 'l1' })).resolves.toBe('b');
    expect(db.labStaffAssignment.findFirst).toHaveBeenCalledWith({
      where: { role_membership_id: 'rm', lab_branch: { laboratory_id: 'l1' } },
      select: { lab_branch_id: true },
    });
    db.labStaffAssignment.findFirst.mockResolvedValueOnce(null);
    await expect(repo.findBranchIdForLaboratory(db, { roleMembershipId: 'rm', laboratoryId: 'l1' })).resolves.toBeNull();
  });

  it('deleteByRoleMembershipId deletes by membership', async () => {
    const db = { labStaffAssignment: { deleteMany: jest.fn() } } as any;
    await repo.deleteByRoleMembershipId(db, 'rm');
    expect(db.labStaffAssignment.deleteMany).toHaveBeenCalledWith({ where: { role_membership_id: 'rm' } });
  });
});

describe('LabOrderItemRepository', () => {
  const repo = new LabOrderItemRepository();

  it('queries and updates items', async () => {
    const db = {
      labOrderItem: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: okUpdate() },
    } as any;
    await repo.findByOrderId(db, 'o1');
    expect(db.labOrderItem.findMany).toHaveBeenCalledWith({ where: { lab_order_id: 'o1' } });
    await repo.findById(db, 'i1');
    expect(db.labOrderItem.findUnique).toHaveBeenCalledWith({ where: { id: 'i1' } });
    await repo.setUnitPrice(db, 'o1', '10.00');
    expect(db.labOrderItem.updateMany).toHaveBeenLastCalledWith({ where: { lab_order_id: 'o1' }, data: { unit_price: '10.00' } });
    await repo.resetToPending(db, 'o1');
    expect(db.labOrderItem.updateMany).toHaveBeenLastCalledWith({ where: { lab_order_id: 'o1' }, data: { result_state: 'PENDING' } });
    await repo.markRecorded(db, 'i1', 2);
    expect(db.labOrderItem.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'i1', version: 2 },
      data: { result_state: 'RECORDED', version: { increment: 1 } },
    });
  });
});

describe('LabOrderNoteRepository', () => {
  const repo = new LabOrderNoteRepository();

  it('creates and lists notes oldest-first', async () => {
    const db = { labOrderNote: { create: jest.fn(), findMany: jest.fn() } } as any;
    await repo.create(db, 'o1', 'u1', 'body');
    expect(db.labOrderNote.create).toHaveBeenCalledWith({ data: { lab_order_id: 'o1', author_id: 'u1', body: 'body' } });
    await repo.findByOrderId(db, 'o1');
    expect(db.labOrderNote.findMany).toHaveBeenCalledWith({ where: { lab_order_id: 'o1' }, orderBy: { created_at: 'asc' } });
  });
});

describe('LabResultRepository', () => {
  const repo = new LabResultRepository();

  it('create nulls omitted optional fields', async () => {
    const db = { labResultDocument: { create: jest.fn() } } as any;
    await repo.create(db, { labOrderId: 'o1', fileLabel: 'f', sizeKb: 3, uploadedBy: 'u' });
    expect(db.labResultDocument.create).toHaveBeenCalledWith({
      data: { lab_order_id: 'o1', item_id: null, file_label: 'f', file_url: null, size_kb: 3, uploaded_by: 'u' },
    });
    await repo.create(db, { labOrderId: 'o1', itemId: 'i', fileLabel: 'f', fileUrl: 'url', sizeKb: 3, uploadedBy: 'u' });
    expect(db.labResultDocument.create.mock.calls[1][0].data).toMatchObject({ item_id: 'i', file_url: 'url' });
  });

  it('reads, flags and deletes', async () => {
    const db = {
      labResultDocument: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: okUpdate(), deleteMany: jest.fn() },
    } as any;
    await repo.findById(db, 'r1');
    expect(db.labResultDocument.findUnique).toHaveBeenCalledWith({ where: { id: 'r1' } });
    await repo.findByOrderId(db, 'o1');
    expect(db.labResultDocument.findMany).toHaveBeenCalledWith({ where: { lab_order_id: 'o1' } });
    await repo.setCriticalCall(db, 'r1', 1, true);
    expect(db.labResultDocument.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', version: 1 },
      data: { is_critical: true, review_state: 'REVIEWED', version: { increment: 1 } },
    });
    await repo.deleteByOrderId(db, 'o1');
    expect(db.labResultDocument.deleteMany).toHaveBeenCalledWith({ where: { lab_order_id: 'o1' } });
  });
});
