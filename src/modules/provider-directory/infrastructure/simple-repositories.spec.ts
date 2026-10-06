import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';
import { AddressRepository } from './address.repository';
import { ClinicBranchRepository } from './clinic-branch.repository';
import { ClinicRepository } from './clinic.repository';
import { PharmacyBranchRepository } from './pharmacy-branch.repository';
import { PharmacyStaffAssignmentRepository } from './pharmacy-staff-assignment.repository';
import { VerificationDocumentRepository } from './verification-document.repository';
import { AffiliationRepository, toVisibilityChainInput } from './affiliation.repository';

const delegate = () => ({
  create: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn(),
  findFirst: jest.fn(),
  updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  upsert: jest.fn(),
});

/** updateMany args for one optimistic-lock update. */
const lockArgs = (id: string, version: number, data: Record<string, unknown>) => ({
  where: { id, version },
  data: { ...data, version: { increment: 1 } },
});

describe('AddressRepository', () => {
  const repo = new AddressRepository();

  it('create maps fields to snake_case', async () => {
    const db = { address: delegate() };
    db.address.create.mockResolvedValue({ id: 'a' });
    await expect(
      repo.create(db as never, { line1: 'l', city: 'c', regionCode: 'r', countryCode: 'EG', geoLat: 1, geoLng: 2 }),
    ).resolves.toEqual({ id: 'a' });
    expect(db.address.create).toHaveBeenCalledWith({
      data: { line1: 'l', city: 'c', region_code: 'r', country_code: 'EG', geo_lat: 1, geo_lng: 2 },
    });
  });

  it('update writes every provided field', async () => {
    const db = { address: delegate() };
    await repo.update(db as never, 'a', 2, { line1: 'l', city: 'c', regionCode: 'r', countryCode: 'EG', geoLat: 0, geoLng: 0 });
    expect(db.address.updateMany).toHaveBeenCalledWith(
      lockArgs('a', 2, { line1: 'l', city: 'c', region_code: 'r', country_code: 'EG', geo_lat: 0, geo_lng: 0 }),
    );
  });

  it('update omits undefined fields', async () => {
    const db = { address: delegate() };
    await repo.update(db as never, 'a', 2, {});
    expect(db.address.updateMany).toHaveBeenCalledWith(lockArgs('a', 2, {}));
  });

  it('update throws on a version conflict', async () => {
    const db = { address: delegate() };
    db.address.updateMany.mockResolvedValue({ count: 0 });
    await expect(repo.update(db as never, 'a', 2, {})).rejects.toBeInstanceOf(OptimisticLockError);
  });
});

describe('ClinicBranchRepository', () => {
  const repo = new ClinicBranchRepository();

  it('create inserts a VERIFIED branch', async () => {
    const db = { clinicBranch: delegate() };
    db.clinicBranch.create.mockResolvedValue({ id: 'b' });
    await expect(repo.create(db as never, { clinicId: 'c', addressId: 'a', phone: 'p', ianaTimezone: 'tz' })).resolves.toEqual({ id: 'b' });
    expect(db.clinicBranch.create).toHaveBeenCalledWith({
      data: { clinic_id: 'c', address_id: 'a', phone: 'p', iana_timezone: 'tz', status: 'VERIFIED' },
    });
  });

  it('findById / findByIdWithRelations', async () => {
    const db = { clinicBranch: delegate() };
    db.clinicBranch.findUnique.mockResolvedValue(null);
    await expect(repo.findById(db as never, 'b')).resolves.toBeNull();
    expect(db.clinicBranch.findUnique).toHaveBeenLastCalledWith({ where: { id: 'b' } });
    await repo.findByIdWithRelations(db as never, 'b');
    expect(db.clinicBranch.findUnique).toHaveBeenLastCalledWith({ where: { id: 'b' }, include: { address: true, clinic: true } });
  });

  it('update with and without fields', async () => {
    const db = { clinicBranch: delegate() };
    await repo.update(db as never, 'b', 1, { phone: 'p', ianaTimezone: 'tz' });
    expect(db.clinicBranch.updateMany).toHaveBeenLastCalledWith(lockArgs('b', 1, { phone: 'p', iana_timezone: 'tz' }));
    await repo.update(db as never, 'b', 1, {});
    expect(db.clinicBranch.updateMany).toHaveBeenLastCalledWith(lockArgs('b', 1, {}));
  });

  it('setStatus', async () => {
    const db = { clinicBranch: delegate() };
    await repo.setStatus(db as never, 'b', 3, 'SUSPENDED');
    expect(db.clinicBranch.updateMany).toHaveBeenCalledWith(lockArgs('b', 3, { status: 'SUSPENDED' }));
  });
});

describe('ClinicRepository', () => {
  const repo = new ClinicRepository();

  it('create maps fields', async () => {
    const db = { clinic: delegate() };
    db.clinic.create.mockResolvedValue({ id: 'c' });
    await expect(repo.create(db as never, { legalName: 'l', brandName: 'b', taxId: 't', regionCode: 'r' })).resolves.toEqual({ id: 'c' });
    expect(db.clinic.create).toHaveBeenCalledWith({ data: { legal_name: 'l', brand_name: 'b', tax_id: 't', region_code: 'r' } });
  });

  it('findById / findByIdWithBranches', async () => {
    const db = { clinic: delegate() };
    await repo.findById(db as never, 'c');
    expect(db.clinic.findUnique).toHaveBeenLastCalledWith({ where: { id: 'c' } });
    await repo.findByIdWithBranches(db as never, 'c');
    expect(db.clinic.findUnique).toHaveBeenLastCalledWith({ where: { id: 'c' }, include: { branches: { include: { address: true } } } });
  });

  it('update with all fields and with none', async () => {
    const db = { clinic: delegate() };
    await repo.update(db as never, 'c', 1, { legalName: 'l', brandName: 'b', taxId: 't', regionCode: 'r' });
    expect(db.clinic.updateMany).toHaveBeenLastCalledWith(lockArgs('c', 1, { legal_name: 'l', brand_name: 'b', tax_id: 't', region_code: 'r' }));
    await repo.update(db as never, 'c', 1, {});
    expect(db.clinic.updateMany).toHaveBeenLastCalledWith(lockArgs('c', 1, {}));
  });

  it('setStatus VERIFIED stamps verified_at, SUSPENDED does not', async () => {
    const db = { clinic: delegate() };
    await repo.setStatus(db as never, 'c', 1, 'VERIFIED');
    expect(db.clinic.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'VERIFIED', verified_at: expect.any(Date) }) }),
    );
    await repo.setStatus(db as never, 'c', 1, 'SUSPENDED');
    expect(db.clinic.updateMany).toHaveBeenLastCalledWith(lockArgs('c', 1, { status: 'SUSPENDED' }));
  });
});

describe('PharmacyBranchRepository', () => {
  const repo = new PharmacyBranchRepository();
  const input = { pharmacyId: 'p', addressId: 'a', phone: 'ph', ianaTimezone: 'tz' };

  it('create defaults delivery_capable to false', async () => {
    const db = { pharmacyBranch: delegate() };
    await repo.create(db as never, input);
    expect(db.pharmacyBranch.create).toHaveBeenLastCalledWith({
      data: { pharmacy_id: 'p', address_id: 'a', phone: 'ph', iana_timezone: 'tz', delivery_capable: false, status: 'VERIFIED' },
    });
  });

  it('create honours deliveryCapable', async () => {
    const db = { pharmacyBranch: delegate() };
    await repo.create(db as never, { ...input, deliveryCapable: true });
    expect(db.pharmacyBranch.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ delivery_capable: true }),
    });
  });

  it('finders', async () => {
    const db = { pharmacyBranch: delegate() };
    db.pharmacyBranch.findMany.mockResolvedValue([{ id: 'b' }]);
    await repo.findById(db as never, 'b');
    expect(db.pharmacyBranch.findUnique).toHaveBeenLastCalledWith({ where: { id: 'b' } });
    await expect(repo.findByPharmacyId(db as never, 'p')).resolves.toEqual([{ id: 'b' }]);
    expect(db.pharmacyBranch.findMany).toHaveBeenCalledWith({
      where: { pharmacy_id: 'p' },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
    await repo.findByIdWithRelations(db as never, 'b');
    expect(db.pharmacyBranch.findUnique).toHaveBeenLastCalledWith({ where: { id: 'b' }, include: { address: true, pharmacy: true } });
  });

  it('update with all fields and none', async () => {
    const db = { pharmacyBranch: delegate() };
    await repo.update(db as never, 'b', 1, { phone: 'p', ianaTimezone: 'tz', deliveryCapable: false });
    expect(db.pharmacyBranch.updateMany).toHaveBeenLastCalledWith(lockArgs('b', 1, { phone: 'p', iana_timezone: 'tz', delivery_capable: false }));
    await repo.update(db as never, 'b', 1, {});
    expect(db.pharmacyBranch.updateMany).toHaveBeenLastCalledWith(lockArgs('b', 1, {}));
  });

  it('setStatus', async () => {
    const db = { pharmacyBranch: delegate() };
    await repo.setStatus(db as never, 'b', 1, 'VERIFIED');
    expect(db.pharmacyBranch.updateMany).toHaveBeenCalledWith(lockArgs('b', 1, { status: 'VERIFIED' }));
  });
});

describe('PharmacyStaffAssignmentRepository', () => {
  const repo = new PharmacyStaffAssignmentRepository();

  it('acquireProvisioningLock runs the advisory lock query', async () => {
    const db = { $queryRaw: jest.fn().mockResolvedValue([{ lock: '' }]) };
    await expect(repo.acquireProvisioningLock(db as never, 'p1')).resolves.toBeUndefined();
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = db.$queryRaw.mock.calls[0][0];
    expect(sql.values).toEqual(['pharmacy-staff:p1']);
  });

  it('create upserts by role membership', async () => {
    const db = { pharmacyStaffAssignment: delegate() };
    db.pharmacyStaffAssignment.upsert.mockResolvedValue({ id: 'x' });
    await expect(repo.create(db as never, { userId: 'u', pharmacyBranchId: 'b', roleMembershipId: 'rm' })).resolves.toEqual({ id: 'x' });
    expect(db.pharmacyStaffAssignment.upsert).toHaveBeenCalledWith({
      where: { role_membership_id: 'rm' },
      update: { user_id: 'u', pharmacy_branch_id: 'b' },
      create: { user_id: 'u', pharmacy_branch_id: 'b', role_membership_id: 'rm' },
    });
  });

  it('findByRoleMembershipId', async () => {
    const db = { pharmacyStaffAssignment: delegate() };
    db.pharmacyStaffAssignment.findUnique.mockResolvedValue({ id: 'x' });
    await expect(repo.findByRoleMembershipId(db as never, 'rm')).resolves.toEqual({ id: 'x' });
    expect(db.pharmacyStaffAssignment.findUnique).toHaveBeenCalledWith({ where: { role_membership_id: 'rm' } });
  });

  it('findBranchIdForPharmacy returns the branch id or null', async () => {
    const db = { pharmacyStaffAssignment: delegate() };
    db.pharmacyStaffAssignment.findFirst.mockResolvedValueOnce({ pharmacy_branch_id: 'b' }).mockResolvedValueOnce(null);
    await expect(repo.findBranchIdForPharmacy(db as never, { roleMembershipId: 'rm', pharmacyId: 'p' })).resolves.toBe('b');
    expect(db.pharmacyStaffAssignment.findFirst).toHaveBeenCalledWith({
      where: { role_membership_id: 'rm', pharmacy_branch: { pharmacy_id: 'p' } },
      select: { pharmacy_branch_id: true },
    });
    await expect(repo.findBranchIdForPharmacy(db as never, { roleMembershipId: 'rm', pharmacyId: 'p' })).resolves.toBeNull();
  });
});

describe('VerificationDocumentRepository', () => {
  const repo = new VerificationDocumentRepository();

  it('create maps fields', async () => {
    const db = { providerVerificationDocument: delegate() };
    db.providerVerificationDocument.create.mockResolvedValue({ id: 'd' });
    await expect(repo.create(db as never, { providerType: 'DOCTOR', providerId: 'p', docType: 'L', fileUrl: 'u' })).resolves.toEqual({ id: 'd' });
    expect(db.providerVerificationDocument.create).toHaveBeenCalledWith({
      data: { provider_type: 'DOCTOR', provider_id: 'p', doc_type: 'L', file_url: 'u' },
    });
  });

  it('findById', async () => {
    const db = { providerVerificationDocument: delegate() };
    await repo.findById(db as never, 'd');
    expect(db.providerVerificationDocument.findUnique).toHaveBeenCalledWith({ where: { id: 'd' } });
  });

  it('list with no filters', async () => {
    const db = { providerVerificationDocument: delegate() };
    await repo.list(db as never, { limit: 10 });
    expect(db.providerVerificationDocument.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: 10,
    });
  });

  it('list with every filter and a cursor', async () => {
    const db = { providerVerificationDocument: delegate() };
    const createdAt = '2026-01-01T00:00:00.000Z';
    await repo.list(db as never, {
      providerType: 'CLINIC',
      providerId: 'p',
      status: 'PENDING',
      cursor: { createdAt, id: 'c1' },
      limit: 5,
    });
    expect(db.providerVerificationDocument.findMany).toHaveBeenCalledWith({
      where: {
        provider_type: 'CLINIC',
        provider_id: 'p',
        status: 'PENDING',
        OR: [{ created_at: { gt: new Date(createdAt) } }, { created_at: new Date(createdAt), id: { gt: 'c1' } }],
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: 5,
    });
  });

  it('setDecision records reviewer and time; conflicts throw', async () => {
    const db = { providerVerificationDocument: delegate() };
    await repo.setDecision(db as never, 'd', 4, 'APPROVED', 'admin');
    expect(db.providerVerificationDocument.updateMany).toHaveBeenCalledWith({
      where: { id: 'd', version: 4 },
      data: { status: 'APPROVED', reviewed_by: 'admin', reviewed_at: expect.any(Date), version: { increment: 1 } },
    });
    db.providerVerificationDocument.updateMany.mockResolvedValue({ count: 0 });
    await expect(repo.setDecision(db as never, 'd', 4, 'REJECTED', 'admin')).rejects.toBeInstanceOf(OptimisticLockError);
  });
});

describe('AffiliationRepository', () => {
  const repo = new AffiliationRepository();

  it('create maps fields', async () => {
    const db = { doctorClinicAffiliation: delegate() };
    await repo.create(db as never, { doctorId: 'd', clinicBranchId: 'b', consultFee: '100', currency: 'EGP' });
    expect(db.doctorClinicAffiliation.create).toHaveBeenCalledWith({
      data: { doctor_id: 'd', clinic_branch_id: 'b', consult_fee: '100', currency: 'EGP' },
    });
  });

  it('findById', async () => {
    const db = { doctorClinicAffiliation: delegate() };
    await repo.findById(db as never, 'a');
    expect(db.doctorClinicAffiliation.findUnique).toHaveBeenCalledWith({ where: { id: 'a' } });
  });

  it('findByDoctorAndBranch uses the composite key and the visibility select', async () => {
    const db = { doctorClinicAffiliation: delegate() };
    await repo.findByDoctorAndBranch(db as never, 'd', 'b');
    const arg = db.doctorClinicAffiliation.findUnique.mock.calls[0][0];
    expect(arg.where).toEqual({ doctor_id_clinic_branch_id: { doctor_id: 'd', clinic_branch_id: 'b' } });
    expect(arg.select).toEqual(expect.objectContaining({ id: true, status: true, doctor: expect.anything(), clinic_branch: expect.anything() }));
  });

  it('findManyByIdsWithVisibilityChain', async () => {
    const db = { doctorClinicAffiliation: delegate() };
    await repo.findManyByIdsWithVisibilityChain(db as never, ['a', 'b']);
    expect(db.doctorClinicAffiliation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['a', 'b'] } } }),
    );
  });

  it('findByDoctorId filters ACTIVE only when onlyActive', async () => {
    const db = { doctorClinicAffiliation: delegate() };
    await repo.findByDoctorId(db as never, 'd', true);
    expect(db.doctorClinicAffiliation.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { doctor_id: 'd', status: 'ACTIVE' } }),
    );
    await repo.findByDoctorId(db as never, 'd', false);
    expect(db.doctorClinicAffiliation.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { doctor_id: 'd' } }));
  });

  it('update with all fields and none', async () => {
    const db = { doctorClinicAffiliation: delegate() };
    await repo.update(db as never, 'a', 1, { status: 'PAUSED', consultFee: '5', currency: 'USD' });
    expect(db.doctorClinicAffiliation.updateMany).toHaveBeenLastCalledWith(lockArgs('a', 1, { status: 'PAUSED', consult_fee: '5', currency: 'USD' }));
    await repo.update(db as never, 'a', 1, {});
    expect(db.doctorClinicAffiliation.updateMany).toHaveBeenLastCalledWith(lockArgs('a', 1, {}));
  });

  it('toVisibilityChainInput maps the chain', () => {
    const deletedAt = new Date();
    expect(
      toVisibilityChainInput({
        id: 'a',
        status: 'ACTIVE',
        doctor: { status: 'VERIFIED', deleted_at: null },
        clinic_branch: { status: 'VERIFIED', iana_timezone: 'tz', clinic: { status: 'SUSPENDED', deleted_at: deletedAt } },
      } as never),
    ).toEqual({
      doctor: { status: 'VERIFIED', deletedAt: null },
      affiliation: { status: 'ACTIVE' },
      branch: { status: 'VERIFIED' },
      clinic: { status: 'SUSPENDED', deletedAt },
    });
  });
});
