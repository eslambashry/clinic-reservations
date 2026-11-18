import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';
import { ClinicStaffAssignmentRepository } from './clinic-staff-assignment.repository';
import { DoctorRepository } from './doctor.repository';
import { PharmacyRepository } from './pharmacy.repository';
import { SpecialtyRepository } from './specialty.repository';

const delegate = () => ({
  create: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn(),
  findFirst: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  deleteMany: jest.fn(),
  createMany: jest.fn(),
  updateMany: jest.fn().mockResolvedValue({ count: 1 }),
});

const lockArgs = (id: string, version: number, data: Record<string, unknown>) => ({
  where: { id, version },
  data: { ...data, version: { increment: 1 } },
});

const createdAt = '2026-02-03T04:05:06.000Z';

describe('DoctorRepository', () => {
  const repo = new DoctorRepository();
  const include = { user: true, specialty: true };

  it('create maps fields', async () => {
    const db = { doctor: delegate() };
    db.doctor.create.mockResolvedValue({ id: 'd' });
    await expect(
      repo.create(db as never, {
        userId: 'u', specialtyCode: 's', licenseNumber: 'l', regionCode: 'r', photoUrl: 'p', degree: 'dg', bio: 'b', experienceYears: 4,
      }),
    ).resolves.toEqual({ id: 'd' });
    expect(db.doctor.create).toHaveBeenCalledWith({
      data: {
        user_id: 'u', specialty_code: 's', license_number: 'l', region_code: 'r', photo_url: 'p', degree: 'dg', bio: 'b', experience_years: 4,
      },
    });
  });

  it('finders', async () => {
    const db = { doctor: delegate() };
    await repo.findById(db as never, 'd');
    expect(db.doctor.findUnique).toHaveBeenLastCalledWith({ where: { id: 'd' } });
    await repo.findByUserId(db as never, 'u');
    expect(db.doctor.findUnique).toHaveBeenLastCalledWith({ where: { user_id: 'u' } });
    await repo.findByUserIdWithUser(db as never, 'u');
    expect(db.doctor.findUnique).toHaveBeenLastCalledWith({ where: { user_id: 'u' }, include });
    await repo.findByIdWithUser(db as never, 'd');
    expect(db.doctor.findUnique).toHaveBeenLastCalledWith({ where: { id: 'd' }, include });
  });

  it('lockForClinicalWrite issues a FOR UPDATE query', async () => {
    const db = { $queryRaw: jest.fn().mockResolvedValue([]) };
    await expect(repo.lockForClinicalWrite(db as never, 'd')).resolves.toBeUndefined();
    const [strings, id] = db.$queryRaw.mock.calls[0];
    expect(strings.join('?')).toContain('FOR UPDATE');
    expect(id).toBe('d');
  });

  it('update with all fields and none', async () => {
    const db = { doctor: delegate() };
    await repo.update(db as never, 'd', 1, {
      specialtyCode: 's', licenseNumber: 'l', regionCode: 'r', photoUrl: 'p', bio: 'b', degree: 'dg', experienceYears: 0,
    });
    expect(db.doctor.updateMany).toHaveBeenLastCalledWith(
      lockArgs('d', 1, {
        specialty_code: 's', license_number: 'l', region_code: 'r', photo_url: 'p', bio: 'b', degree: 'dg', experience_years: 0,
      }),
    );
    await repo.update(db as never, 'd', 1, {});
    expect(db.doctor.updateMany).toHaveBeenLastCalledWith(lockArgs('d', 1, {}));
  });

  it('update surfaces a version conflict', async () => {
    const db = { doctor: delegate() };
    db.doctor.updateMany.mockResolvedValue({ count: 0 });
    await expect(repo.update(db as never, 'd', 1, {})).rejects.toBeInstanceOf(OptimisticLockError);
  });

  it('setStatus VERIFIED stamps license_verified_at; others do not', async () => {
    const db = { doctor: delegate() };
    await repo.setStatus(db as never, 'd', 1, 'VERIFIED');
    expect(db.doctor.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'VERIFIED', license_verified_at: expect.any(Date) }) }),
    );
    await repo.setStatus(db as never, 'd', 1, 'REJECTED');
    expect(db.doctor.updateMany).toHaveBeenLastCalledWith(lockArgs('d', 1, { status: 'REJECTED' }));
  });

  it('list with no filters', async () => {
    const db = { doctor: delegate() };
    await repo.list(db as never, { limit: 10 });
    expect(db.doctor.findMany).toHaveBeenCalledWith({
      where: { deleted_at: null },
      include,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 10,
    });
  });

  it('list in cursor mode uses descending comparisons', async () => {
    const db = { doctor: delegate() };
    await repo.list(db as never, { limit: 10, status: 'PENDING', cursor: { createdAt, id: 'c' } });
    expect(db.doctor.findMany).toHaveBeenCalledWith({
      where: {
        deleted_at: null,
        status: 'PENDING',
        OR: [{ created_at: { lt: new Date(createdAt) } }, { created_at: new Date(createdAt), id: { lt: 'c' } }],
      },
      include,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 10,
    });
  });

  it('list in offset mode skips the cursor predicate', async () => {
    const db = { doctor: delegate() };
    await repo.list(db as never, { limit: 10, skip: 20, cursor: { createdAt, id: 'c' } });
    expect(db.doctor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted_at: null }, skip: 20, take: 10 }),
    );
  });

  it('count shares the list filter', async () => {
    const db = { doctor: delegate() };
    db.doctor.count.mockResolvedValue(7);
    await expect(repo.count(db as never, { status: 'VERIFIED' })).resolves.toBe(7);
    expect(db.doctor.count).toHaveBeenCalledWith({ where: { deleted_at: null, status: 'VERIFIED' } });
  });
});

describe('PharmacyRepository', () => {
  const repo = new PharmacyRepository();

  it('create maps fields', async () => {
    const db = { pharmacy: delegate() };
    await repo.create(db as never, { legalName: 'l', brandName: 'b', taxId: 't', regionCode: 'r' });
    expect(db.pharmacy.create).toHaveBeenCalledWith({ data: { legal_name: 'l', brand_name: 'b', tax_id: 't', region_code: 'r' } });
  });

  it('finders', async () => {
    const db = { pharmacy: delegate() };
    await repo.findById(db as never, 'p');
    expect(db.pharmacy.findUnique).toHaveBeenLastCalledWith({ where: { id: 'p' } });
    await repo.findByIdWithBranches(db as never, 'p');
    expect(db.pharmacy.findUnique).toHaveBeenLastCalledWith({ where: { id: 'p' }, include: { branches: { include: { address: true } } } });
  });

  it('update with all fields and none', async () => {
    const db = { pharmacy: delegate() };
    await repo.update(db as never, 'p', 1, { legalName: 'l', brandName: 'b', taxId: 't', regionCode: 'r' });
    expect(db.pharmacy.updateMany).toHaveBeenLastCalledWith(lockArgs('p', 1, { legal_name: 'l', brand_name: 'b', tax_id: 't', region_code: 'r' }));
    await repo.update(db as never, 'p', 1, {});
    expect(db.pharmacy.updateMany).toHaveBeenLastCalledWith(lockArgs('p', 1, {}));
  });

  it('setStatus VERIFIED stamps verified_at; SUSPENDED does not', async () => {
    const db = { pharmacy: delegate() };
    await repo.setStatus(db as never, 'p', 1, 'VERIFIED');
    expect(db.pharmacy.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'VERIFIED', verified_at: expect.any(Date) }) }),
    );
    await repo.setStatus(db as never, 'p', 1, 'SUSPENDED');
    expect(db.pharmacy.updateMany).toHaveBeenLastCalledWith(lockArgs('p', 1, { status: 'SUSPENDED' }));
  });

  it('list without filters', async () => {
    const db = { pharmacy: delegate() };
    await repo.list(db as never, { limit: 5 });
    expect(db.pharmacy.findMany).toHaveBeenCalledWith({
      where: { deleted_at: null },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: 5,
    });
  });

  it('list in cursor mode uses ascending comparisons', async () => {
    const db = { pharmacy: delegate() };
    await repo.list(db as never, { limit: 5, status: 'VERIFIED', cursor: { createdAt, id: 'c' } });
    expect(db.pharmacy.findMany).toHaveBeenCalledWith({
      where: {
        deleted_at: null,
        status: 'VERIFIED',
        OR: [{ created_at: { gt: new Date(createdAt) } }, { created_at: new Date(createdAt), id: { gt: 'c' } }],
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: 5,
    });
  });

  it('list in offset mode skips the cursor predicate', async () => {
    const db = { pharmacy: delegate() };
    await repo.list(db as never, { limit: 5, skip: 10, cursor: { createdAt, id: 'c' } });
    expect(db.pharmacy.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deleted_at: null }, skip: 10 }));
  });

  it('count', async () => {
    const db = { pharmacy: delegate() };
    db.pharmacy.count.mockResolvedValue(3);
    await expect(repo.count(db as never, { status: 'SUSPENDED' })).resolves.toBe(3);
    expect(db.pharmacy.count).toHaveBeenCalledWith({ where: { deleted_at: null, status: 'SUSPENDED' } });
  });
});

describe('ClinicStaffAssignmentRepository', () => {
  const repo = new ClinicStaffAssignmentRepository();

  it('findClinicBranchIdsByRoleMembership maps to branch ids', async () => {
    const db = { clinicStaffAssignment: delegate() };
    db.clinicStaffAssignment.findMany.mockResolvedValue([{ clinic_branch_id: 'b1' }, { clinic_branch_id: 'b2' }]);
    await expect(repo.findClinicBranchIdsByRoleMembership(db as never, 'rm')).resolves.toEqual(['b1', 'b2']);
    expect(db.clinicStaffAssignment.findMany).toHaveBeenCalledWith({
      where: { role_membership_id: 'rm' },
      select: { clinic_branch_id: true },
    });
  });

  it('findClinicBranchIdsByRoleMembershipIds groups branch ids per membership', async () => {
    const db = { clinicStaffAssignment: delegate() };
    db.clinicStaffAssignment.findMany.mockResolvedValue([
      { role_membership_id: 'r1', clinic_branch_id: 'b1' },
      { role_membership_id: 'r1', clinic_branch_id: 'b2' },
      { role_membership_id: 'r2', clinic_branch_id: 'b3' },
    ]);
    const result = await repo.findClinicBranchIdsByRoleMembershipIds(db as never, ['r1', 'r2']);
    expect(result).toEqual(new Map([['r1', ['b1', 'b2']], ['r2', ['b3']]]));
    expect(db.clinicStaffAssignment.findMany).toHaveBeenCalledWith({ where: { role_membership_id: { in: ['r1', 'r2'] } } });
  });

  it('findActiveUserIdsByClinicBranchId de-duplicates users, without doctor scope', async () => {
    const db = { clinicStaffAssignment: delegate() };
    db.clinicStaffAssignment.findMany.mockResolvedValue([
      { role_membership: { user_id: 'u1' } },
      { role_membership: { user_id: 'u1' } },
      { role_membership: { user_id: 'u2' } },
    ]);
    await expect(repo.findActiveUserIdsByClinicBranchId(db as never, 'b')).resolves.toEqual(['u1', 'u2']);
    expect(db.clinicStaffAssignment.findMany).toHaveBeenCalledWith({
      where: {
        clinic_branch_id: 'b',
        role_membership: { status: 'ACTIVE', role_code: 'CLINIC_STAFF', context_type: 'CLINIC_STAFF', user: { status: 'ACTIVE' } },
      },
      select: { role_membership: { select: { user_id: true } } },
    });
  });

  it('findActiveUserIdsByClinicBranchId scopes to a doctor when given', async () => {
    const db = { clinicStaffAssignment: delegate() };
    db.clinicStaffAssignment.findMany.mockResolvedValue([]);
    await expect(repo.findActiveUserIdsByClinicBranchId(db as never, 'b', 'doc')).resolves.toEqual([]);
    expect(db.clinicStaffAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role_membership: expect.objectContaining({ context_id: 'doc' }),
        }),
      }),
    );
  });

  it('createMany builds one row per branch', async () => {
    const db = { clinicStaffAssignment: delegate() };
    db.clinicStaffAssignment.createMany.mockResolvedValue({ count: 2 });
    await expect(repo.createMany(db as never, 'rm', ['b1', 'b2'])).resolves.toEqual({ count: 2 });
    expect(db.clinicStaffAssignment.createMany).toHaveBeenCalledWith({
      data: [
        { role_membership_id: 'rm', clinic_branch_id: 'b1' },
        { role_membership_id: 'rm', clinic_branch_id: 'b2' },
      ],
    });
  });

  it('replaceForRoleMembership deletes then recreates', async () => {
    const db = { clinicStaffAssignment: delegate() };
    await repo.replaceForRoleMembership(db as never, 'rm', ['b1']);
    expect(db.clinicStaffAssignment.deleteMany).toHaveBeenCalledWith({ where: { role_membership_id: 'rm' } });
    expect(db.clinicStaffAssignment.createMany).toHaveBeenCalledWith({
      data: [{ role_membership_id: 'rm', clinic_branch_id: 'b1' }],
    });
  });

  it('replaceForRoleMembership with no branches only deletes', async () => {
    const db = { clinicStaffAssignment: delegate() };
    await repo.replaceForRoleMembership(db as never, 'rm', []);
    expect(db.clinicStaffAssignment.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.clinicStaffAssignment.createMany).not.toHaveBeenCalled();
  });
});

describe('SpecialtyRepository', () => {
  const countsInclude = { _count: { select: { doctors: true, children: true } } };
  const row = { code: 'c', name_ar: 'n', parent_code: null, _count: { doctors: 2, children: 1 } };
  const mapped = { code: 'c', name_ar: 'n', parent_code: null, doctorCount: 2, childCount: 1 };

  function setup() {
    const prisma = { specialty: delegate() };
    return { prisma, repo: new SpecialtyRepository(prisma as never) };
  }

  it('findAll orders by name', async () => {
    const { prisma, repo } = setup();
    prisma.specialty.findMany.mockResolvedValue([1]);
    await expect(repo.findAll()).resolves.toEqual([1]);
    expect(prisma.specialty.findMany).toHaveBeenCalledWith({ orderBy: { name_ar: 'asc' } });
  });

  it('findByCode uses the supplied transaction client', async () => {
    const { repo } = setup();
    const db = { specialty: delegate() };
    db.specialty.findUnique.mockResolvedValue({ code: 'c' });
    await expect(repo.findByCode(db as never, 'c')).resolves.toEqual({ code: 'c' });
    expect(db.specialty.findUnique).toHaveBeenCalledWith({ where: { code: 'c' } });
  });

  it('findPageWithCounts with a search term', async () => {
    const { prisma, repo } = setup();
    prisma.specialty.findMany.mockResolvedValue([row]);
    await expect(repo.findPageWithCounts({ search: 'x', skip: 5, take: 10 })).resolves.toEqual([mapped]);
    expect(prisma.specialty.findMany).toHaveBeenCalledWith({
      where: { name_ar: { contains: 'x', mode: 'insensitive' } },
      orderBy: { name_ar: 'asc' },
      skip: 5,
      take: 10,
      include: countsInclude,
    });
  });

  it('findPageWithCounts without a search term has no where filter', async () => {
    const { prisma, repo } = setup();
    prisma.specialty.findMany.mockResolvedValue([]);
    await expect(repo.findPageWithCounts({ skip: 0, take: 10 })).resolves.toEqual([]);
    expect(prisma.specialty.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
  });

  it('countAll with and without search', async () => {
    const { prisma, repo } = setup();
    prisma.specialty.count.mockResolvedValue(4);
    await expect(repo.countAll('x')).resolves.toBe(4);
    expect(prisma.specialty.count).toHaveBeenLastCalledWith({ where: { name_ar: { contains: 'x', mode: 'insensitive' } } });
    await repo.countAll();
    expect(prisma.specialty.count).toHaveBeenLastCalledWith({ where: undefined });
  });

  it('findAllNames selects only code and name', async () => {
    const { prisma, repo } = setup();
    prisma.specialty.findMany.mockResolvedValue([{ code: 'c', name_ar: 'n' }]);
    await expect(repo.findAllNames()).resolves.toEqual([{ code: 'c', name_ar: 'n' }]);
    expect(prisma.specialty.findMany).toHaveBeenCalledWith({ orderBy: { name_ar: 'asc' }, select: { code: true, name_ar: true } });
  });

  it('findByCodeWithCounts maps counts, or returns null', async () => {
    const { prisma, repo } = setup();
    prisma.specialty.findUnique.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    await expect(repo.findByCodeWithCounts('c')).resolves.toEqual(mapped);
    expect(prisma.specialty.findUnique).toHaveBeenCalledWith({ where: { code: 'c' }, include: countsInclude });
    await expect(repo.findByCodeWithCounts('c')).resolves.toBeNull();
  });

  it('create defaults parent_code to null', async () => {
    const { repo } = setup();
    const db = { specialty: delegate() };
    await repo.create(db as never, { name_ar: 'n' });
    expect(db.specialty.create).toHaveBeenLastCalledWith({ data: { name_ar: 'n', parent_code: null } });
    await repo.create(db as never, { name_ar: 'n', parent_code: 'p' });
    expect(db.specialty.create).toHaveBeenLastCalledWith({ data: { name_ar: 'n', parent_code: 'p' } });
  });

  it('update only writes provided fields (null parent clears)', async () => {
    const { repo } = setup();
    const db = { specialty: delegate() };
    await repo.update(db as never, 'c', { name_ar: 'n', parent_code: null });
    expect(db.specialty.update).toHaveBeenLastCalledWith({ where: { code: 'c' }, data: { name_ar: 'n', parent_code: null } });
    await repo.update(db as never, 'c', {});
    expect(db.specialty.update).toHaveBeenLastCalledWith({ where: { code: 'c' }, data: {} });
  });

  it('delete, countDoctors, countChildren', async () => {
    const { repo } = setup();
    const db = { specialty: delegate(), doctor: delegate() };
    db.doctor.count.mockResolvedValue(2);
    db.specialty.count.mockResolvedValue(1);
    await expect(repo.delete(db as never, 'c')).resolves.toBeUndefined();
    expect(db.specialty.delete).toHaveBeenCalledWith({ where: { code: 'c' } });
    await expect(repo.countDoctors(db as never, 'c')).resolves.toBe(2);
    expect(db.doctor.count).toHaveBeenCalledWith({ where: { specialty_code: 'c' } });
    await expect(repo.countChildren(db as never, 'c')).resolves.toBe(1);
    expect(db.specialty.count).toHaveBeenCalledWith({ where: { parent_code: 'c' } });
  });

  it('ancestorCodes walks up to the root', async () => {
    const { repo } = setup();
    const db = { specialty: delegate() };
    db.specialty.findUnique
      .mockResolvedValueOnce({ parent_code: 'b' })
      .mockResolvedValueOnce({ parent_code: 'a' })
      .mockResolvedValueOnce({ parent_code: null });
    await expect(repo.ancestorCodes(db as never, 'c')).resolves.toEqual(['c', 'b', 'a']);
    expect(db.specialty.findUnique).toHaveBeenCalledWith({ where: { code: 'c' }, select: { parent_code: true } });
  });

  it('ancestorCodes stops on a missing row', async () => {
    const { repo } = setup();
    const db = { specialty: delegate() };
    db.specialty.findUnique.mockResolvedValue(null);
    await expect(repo.ancestorCodes(db as never, 'c')).resolves.toEqual(['c']);
  });

  it('ancestorCodes guards against a cycle', async () => {
    const { repo } = setup();
    const db = { specialty: delegate() };
    db.specialty.findUnique.mockResolvedValueOnce({ parent_code: 'b' }).mockResolvedValueOnce({ parent_code: 'a' });
    await expect(repo.ancestorCodes(db as never, 'a')).resolves.toEqual(['a', 'b']);
    expect(db.specialty.findUnique).toHaveBeenCalledTimes(2);
  });
});
