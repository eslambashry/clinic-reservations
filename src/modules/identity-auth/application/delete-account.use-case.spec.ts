import { Prisma } from '@prisma/client';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { DeleteAccountUseCase } from './delete-account.use-case';

describe('DeleteAccountUseCase', () => {
  function setup(over: { user?: any; roles?: string[]; doctor?: any; open?: number; wallet?: any } = {}) {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue('user' in over ? over.user : { id: 'u1', deleted_at: null }),
        update: jest.fn(),
      },
      roleMembership: {
        findMany: jest.fn().mockResolvedValue((over.roles ?? ['PATIENT']).map((role_code) => ({ role_code }))),
        updateMany: jest.fn(),
      },
      doctor: { findUnique: jest.fn().mockResolvedValue(over.doctor ?? null), update: jest.fn() },
      appointment: { count: jest.fn().mockResolvedValue(over.open ?? 0) },
      wallet: { findUnique: jest.fn().mockResolvedValue('wallet' in over ? over.wallet : null) },
      notificationPreference: { deleteMany: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const refreshTokens = { lockUserForAuthMutation: jest.fn(), revokeAllActiveForUser: jest.fn() };
    const devices = { deleteAllForUser: jest.fn() };
    const useCase = new DeleteAccountUseCase(prisma as any, refreshTokens as any, devices as any);
    return { tx, refreshTokens, devices, useCase };
  }

  it('anonymises the user, revokes memberships and sessions, and removes devices', async () => {
    const { tx, refreshTokens, devices, useCase } = setup();

    await useCase.execute('u1');

    const data = tx.user.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ phone: 'deleted:u1', email: null, first_name: null, last_name: null, password_hash: null, status: 'SUSPENDED' });
    expect(data.deleted_at).toBeInstanceOf(Date);
    expect(tx.roleMembership.updateMany).toHaveBeenCalledWith({ where: { user_id: 'u1', status: 'ACTIVE' }, data: { status: 'REVOKED' } });
    expect(refreshTokens.revokeAllActiveForUser).toHaveBeenCalledWith(tx, 'u1');
    expect(devices.deleteAllForUser).toHaveBeenCalledWith(tx, 'u1');
    expect(tx.doctor.update).not.toHaveBeenCalled();
  });

  it('also soft-deletes the doctor profile and checks the doctor\'s appointments', async () => {
    const { tx, useCase } = setup({ roles: ['PATIENT', 'DOCTOR'], doctor: { id: 'd1' } });

    await useCase.execute('u1');

    expect(tx.appointment.count.mock.calls[0][0].where.OR).toContainEqual({ affiliation: { doctor_id: 'd1' } });
    expect(tx.doctor.update.mock.calls[0][0]).toMatchObject({ where: { id: 'd1' }, data: { status: 'SUSPENDED', photo_url: null } });
  });

  it('throws NotFound for a missing or already-deleted user', async () => {
    await expect(setup({ user: null }).useCase.execute('u1')).rejects.toBeInstanceOf(NotFoundError);
    await expect(setup({ user: { id: 'u1', deleted_at: new Date() } }).useCase.execute('u1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses staff/admin accounts', async () => {
    const { tx, useCase } = setup({ roles: ['PATIENT', 'PHARMACY_STAFF'] });
    await expect(useCase.execute('u1')).rejects.toBeInstanceOf(ForbiddenError);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('refuses while open appointments exist', async () => {
    const { tx, useCase } = setup({ open: 2 });
    await expect(useCase.execute('u1')).rejects.toMatchObject({ code: 'ACCOUNT_HAS_OPEN_APPOINTMENTS' });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('refuses while the wallet holds funds, but allows a zero balance', async () => {
    const funded = setup({ wallet: { balance: new Prisma.Decimal('10.50') } });
    await expect(funded.useCase.execute('u1')).rejects.toBeInstanceOf(ConflictError);
    await expect(funded.useCase.execute('u1')).rejects.toMatchObject({ code: 'ACCOUNT_HAS_WALLET_BALANCE' });

    const empty = setup({ wallet: { balance: new Prisma.Decimal(0) } });
    await expect(empty.useCase.execute('u1')).resolves.toBeUndefined();
  });
});
