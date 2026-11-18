import * as argon2 from '@node-rs/argon2';
import { ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { UpdateStaffMembershipUseCase } from './update-staff-membership.use-case';

const scope = { roleMembershipId: 'm1', roleCode: 'CLINIC_STAFF', contextType: 'CLINIC_STAFF' as any, contextId: 'doc-1' };
const ownHistory = [{ role_code: 'CLINIC_STAFF', context_type: 'CLINIC_STAFF', context_id: 'doc-1' }];

function setup(history: any[] = ownHistory) {
  const tx: any = {};
  const users = { lockForAuthMutation: jest.fn(), updateProfile: jest.fn(), setStatus: jest.fn(), setPassword: jest.fn() };
  const roleMemberships = {
    findByIdForContext: jest.fn(),
    findAllByUser: jest.fn().mockResolvedValue(history),
    setTitleSubtitle: jest.fn(),
  };
  const membership = {
    id: 'm1',
    title: 'oldT',
    subtitle: null,
    created_at: new Date('2026-01-01'),
    user: { id: 'u1', phone: '+20', first_name: 'N', status: 'ACTIVE' },
  };
  roleMemberships.findByIdForContext.mockResolvedValue(membership);
  return { tx, users, roleMemberships, membership, useCase: new UpdateStaffMembershipUseCase(users as any, roleMemberships as any) };
}

describe('UpdateStaffMembershipUseCase (extra paths)', () => {
  it('throws ConflictError when the identity is not exclusively owned', async () => {
    const { tx, useCase, users } = setup([{ role_code: 'PATIENT', context_type: 'PATIENT', context_id: null }]);
    await expect(useCase.execute(tx, scope)).rejects.toBeInstanceOf(ConflictError);
    expect(users.lockForAuthMutation).toHaveBeenCalledWith(tx, 'u1');
  });

  it('404s when the membership vanished after acquiring the lock', async () => {
    const { tx, useCase, roleMemberships, membership } = setup();
    roleMemberships.findByIdForContext.mockResolvedValueOnce(membership).mockResolvedValueOnce(null);
    await expect(useCase.execute(tx, scope)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('hashes and sets a new password and echoes it back', async () => {
    const { tx, useCase, users } = setup();
    users.setPassword.mockResolvedValue({ id: 'u1', phone: '+20', first_name: 'N', status: 'ACTIVE' });
    const result = await useCase.execute(tx, { ...scope, password: 'Secret123!' });
    const hash = users.setPassword.mock.calls[0][2];
    expect(await argon2.verify(hash, 'Secret123!')).toBe(true);
    expect(result.generatedPassword).toBe('Secret123!');
  });

  it('updates title only, falling back to existing subtitle (undefined when null)', async () => {
    const { tx, useCase, roleMemberships } = setup();
    const result = await useCase.execute(tx, { ...scope, title: 'newT' });
    expect(roleMemberships.setTitleSubtitle).toHaveBeenCalledWith(tx, 'm1', { title: 'newT', subtitle: undefined });
    expect(result.title).toBe('newT');
    expect(result.subtitle).toBeNull();
  });

  it('updates subtitle only, keeping existing title', async () => {
    const { tx, useCase, roleMemberships } = setup();
    const result = await useCase.execute(tx, { ...scope, subtitle: 'sub' });
    expect(roleMemberships.setTitleSubtitle).toHaveBeenCalledWith(tx, 'm1', { title: 'oldT', subtitle: 'sub' });
    expect(result.title).toBe('oldT');
    expect(result.subtitle).toBe('sub');
  });

  it('does not touch title/subtitle when neither provided', async () => {
    const { tx, useCase, roleMemberships } = setup();
    await useCase.execute(tx, scope);
    expect(roleMemberships.setTitleSubtitle).not.toHaveBeenCalled();
  });
});
