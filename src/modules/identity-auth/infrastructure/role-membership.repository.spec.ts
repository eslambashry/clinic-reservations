import { ConflictError } from '../../../shared/core/errors/domain-errors';
import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';
import { RoleMembershipRepository } from './role-membership.repository';

describe('RoleMembershipRepository', () => {
  const repo = new RoleMembershipRepository();
  const db: any = {
    $queryRaw: jest.fn(),
    roleMembership: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  };
  beforeEach(() => {
    jest.resetAllMocks();
    db.roleMembership.findMany.mockResolvedValue([]);
  });

  it('simple finders build expected where', async () => {
    await repo.findActiveByUser(db, 'u');
    expect(db.roleMembership.findMany).toHaveBeenLastCalledWith({
      where: { user_id: 'u', status: 'ACTIVE', user: { status: 'ACTIVE', deleted_at: null } },
      orderBy: { created_at: 'desc' },
    });
    await repo.findActiveById(db, 'i');
    expect(db.roleMembership.findFirst).toHaveBeenLastCalledWith({ where: { id: 'i', status: 'ACTIVE', user: { status: 'ACTIVE', deleted_at: null } } });
    await repo.findAllByUser(db, 'u');
    expect(db.roleMembership.findMany).toHaveBeenLastCalledWith({ where: { user_id: 'u' } });
    await repo.findByUserRoleContext(db, { userId: 'u', roleCode: 'R', contextType: 'CLINIC_STAFF' as any, contextId: 'c' });
    expect(db.roleMembership.findFirst).toHaveBeenLastCalledWith({ where: { user_id: 'u', role_code: 'R', context_type: 'CLINIC_STAFF', context_id: 'c' } });
    await repo.findActiveByUserRoleContextType(db, { userId: 'u', roleCode: 'R', contextType: 'CLINIC_STAFF' as any });
    expect(db.roleMembership.findMany).toHaveBeenLastCalledWith({ where: { user_id: 'u', role_code: 'R', context_type: 'CLINIC_STAFF', status: 'ACTIVE' } });
    await repo.listByContext(db, { roleCode: 'R', contextType: 'CLINIC_STAFF' as any, contextId: 'c' });
    expect(db.roleMembership.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ include: { user: true }, orderBy: { created_at: 'desc' } }));
    await repo.findByIdForContext(db, { id: 'i', roleCode: 'R', contextType: 'CLINIC_STAFF' as any, contextId: 'c' });
    expect(db.roleMembership.findFirst).toHaveBeenLastCalledWith({
      where: { id: 'i', role_code: 'R', context_type: 'CLINIC_STAFF', context_id: 'c', status: 'ACTIVE' },
      include: { user: true },
    });
    await repo.listActiveByRoleContextType(db, { roleCode: 'ADMIN', contextType: 'ADMIN' as any });
    expect(db.roleMembership.findMany).toHaveBeenLastCalledWith({ where: { role_code: 'ADMIN', context_type: 'ADMIN', status: 'ACTIVE' } });
  });

  describe('create', () => {
    it('creates when no conflict', async () => {
      db.roleMembership.create.mockResolvedValue({ id: 'm' });
      const res = await repo.create(db, { userId: 'u', roleCode: 'PATIENT', contextType: 'PATIENT' as any, title: 't', subtitle: 's' });
      expect(res).toEqual({ id: 'm' });
      expect(db.$queryRaw).toHaveBeenCalled();
      expect(db.roleMembership.create).toHaveBeenCalledWith({
        data: { user_id: 'u', role_code: 'PATIENT', context_type: 'PATIENT', context_id: undefined, title: 't', subtitle: 's' },
      });
    });

    it('throws on staff identity conflict', async () => {
      db.roleMembership.findMany.mockResolvedValue([{ role_code: 'CLINIC_STAFF', context_type: 'CLINIC_STAFF', context_id: 'c1' }]);
      await expect(repo.create(db, { userId: 'u', roleCode: 'PATIENT', contextType: 'PATIENT' as any })).rejects.toBeInstanceOf(ConflictError);
      expect(db.roleMembership.create).not.toHaveBeenCalled();
    });

    it('allows staff membership with same scope and passes contextId', async () => {
      db.roleMembership.findMany.mockResolvedValue([{ role_code: 'CLINIC_STAFF', context_type: 'CLINIC_STAFF', context_id: 'c1' }]);
      await repo.create(db, { userId: 'u', roleCode: 'CLINIC_STAFF', contextType: 'CLINIC_STAFF' as any, contextId: 'c1' });
      expect(db.roleMembership.create).toHaveBeenCalled();
    });
  });

  it('setTitleSubtitle updates', async () => {
    await repo.setTitleSubtitle(db, 'i', { title: 't', subtitle: 's' });
    expect(db.roleMembership.update).toHaveBeenCalledWith({ where: { id: 'i' }, data: { title: 't', subtitle: 's' } });
  });

  describe('setStatus', () => {
    it('skips lock when membership missing, then optimistic update', async () => {
      db.roleMembership.findUnique.mockResolvedValue(null);
      db.roleMembership.updateMany.mockResolvedValue({ count: 1 });
      await repo.setStatus(db, 'i', 3, 'REVOKED' as any);
      expect(db.$queryRaw).not.toHaveBeenCalled();
      expect(db.roleMembership.updateMany).toHaveBeenCalledWith({ where: { id: 'i', version: 3 }, data: { status: 'REVOKED', version: { increment: 1 } } });
    });

    it('locks user but skips conflict check for non-ACTIVE', async () => {
      db.roleMembership.findUnique.mockResolvedValue({ user_id: 'u' });
      db.roleMembership.updateMany.mockResolvedValue({ count: 1 });
      await repo.setStatus(db, 'i', 3, 'REVOKED' as any);
      expect(db.$queryRaw).toHaveBeenCalled();
      expect(db.roleMembership.findMany).not.toHaveBeenCalled();
    });

    it('re-activation passes when no conflict', async () => {
      db.roleMembership.findUnique.mockResolvedValue({ user_id: 'u', role_code: 'CLINIC_STAFF', context_type: 'CLINIC_STAFF', context_id: 'c' });
      db.roleMembership.findMany.mockResolvedValue([{ role_code: 'CLINIC_STAFF', context_type: 'CLINIC_STAFF', context_id: 'c' }]);
      db.roleMembership.updateMany.mockResolvedValue({ count: 1 });
      await repo.setStatus(db, 'i', 1, 'ACTIVE' as any);
      expect(db.roleMembership.updateMany).toHaveBeenCalled();
    });

    it('re-activation throws on conflict', async () => {
      db.roleMembership.findUnique.mockResolvedValue({ user_id: 'u', role_code: 'CLINIC_STAFF', context_type: 'CLINIC_STAFF', context_id: 'c' });
      db.roleMembership.findMany.mockResolvedValue([{ role_code: 'PATIENT', context_type: 'PATIENT', context_id: null }]);
      await expect(repo.setStatus(db, 'i', 1, 'ACTIVE' as any)).rejects.toBeInstanceOf(ConflictError);
    });

    it('propagates optimistic lock error', async () => {
      db.roleMembership.findUnique.mockResolvedValue(null);
      db.roleMembership.updateMany.mockResolvedValue({ count: 0 });
      await expect(repo.setStatus(db, 'i', 1, 'REVOKED' as any)).rejects.toBeInstanceOf(OptimisticLockError);
    });
  });
});
