import { PermissionRepository } from './permission.repository';

describe('PermissionRepository', () => {
  it('returns permission codes for a role', async () => {
    const db: any = { rolePermission: { findMany: jest.fn().mockResolvedValue([{ permission_code: 'a' }, { permission_code: 'b' }]) } };
    expect(await new PermissionRepository().findCodesByRole(db, 'ADMIN')).toEqual(['a', 'b']);
    expect(db.rolePermission.findMany).toHaveBeenCalledWith({ where: { role_code: 'ADMIN' }, select: { permission_code: true } });
  });
});
