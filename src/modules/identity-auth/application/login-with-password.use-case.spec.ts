import * as argon2 from '@node-rs/argon2';
import { LoginWithPasswordUseCase } from './login-with-password.use-case';

jest.mock('@node-rs/argon2', () => ({
  verify: jest.fn(),
}));

const verifyMock = argon2.verify as jest.Mock;

function buildTx() {
  return {} as any;
}

describe('LoginWithPasswordUseCase', () => {
  beforeEach(() => {
    verifyMock.mockReset();
  });

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const users = { findByPhone: jest.fn() };
    const roleMemberships = {
      findActiveByUser: jest.fn(),
      findActiveByUserRoleContextType: jest.fn(),
    };
    const tokens = { issue: jest.fn() };
    const rateLimiter = { consume: jest.fn().mockResolvedValue(true) };
    const useCase = new LoginWithPasswordUseCase(
      prisma as any,
      users as any,
      roleMemberships as any,
      tokens as any,
      rateLimiter as any,
    );
    return { tx, prisma, users, roleMemberships, tokens, rateLimiter, useCase };
  }

  it('429s RATE_LIMITED and never looks up the user when the phone is over its login-attempt window', async () => {
    const { users, rateLimiter, useCase } = setup();
    rateLimiter.consume.mockResolvedValue(false);

    await expect(useCase.execute({ phone: '+201001234567', password: 'NewPass1!' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      httpStatus: 429,
    });
    expect(rateLimiter.consume).toHaveBeenCalledWith('+201001234567', {
      keyPrefix: 'password-login-rate',
      maxRequests: 5,
      windowSeconds: 600,
    });
    expect(users.findByPhone).not.toHaveBeenCalled();
  });

  it('401s UNAUTHENTICATED when the phone does not match any user, without attempting to verify a password', async () => {
    const { users, useCase } = setup();
    users.findByPhone.mockResolvedValue(null);

    await expect(useCase.execute({ phone: '+201001234567', password: 'NewPass1!' })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      httpStatus: 401,
    });
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('401s UNAUTHENTICATED when the user has never set a password_hash — same message as any other invalid-credentials case', async () => {
    const { users, useCase } = setup();
    users.findByPhone.mockResolvedValue({ id: 'user-1', phone: '+201001234567', password_hash: null });

    await expect(useCase.execute({ phone: '+201001234567', password: 'NewPass1!' })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      httpStatus: 401,
      message: 'Invalid phone number or password.',
    });
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('401s UNAUTHENTICATED when the password does not match the stored hash', async () => {
    const { users, useCase } = setup();
    users.findByPhone.mockResolvedValue({ id: 'user-1', phone: '+201001234567', password_hash: 'hashed' });
    verifyMock.mockResolvedValue(false);

    await expect(useCase.execute({ phone: '+201001234567', password: 'WrongPass1!' })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      httpStatus: 401,
    });
    expect(verifyMock).toHaveBeenCalledWith('hashed', 'WrongPass1!');
  });

  it('401s UNAUTHENTICATED for a SUSPENDED user even with the correct password — never reaches role-membership lookup', async () => {
    const { users, roleMemberships, useCase } = setup();
    users.findByPhone.mockResolvedValue({ id: 'user-1', phone: '+201001234567', password_hash: 'hashed', status: 'SUSPENDED' });
    verifyMock.mockResolvedValue(true);

    await expect(useCase.execute({ phone: '+201001234567', password: 'NewPass1!' })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      httpStatus: 401,
      message: 'Invalid phone number or password.',
    });
    expect(roleMemberships.findActiveByUser).not.toHaveBeenCalled();
  });

  it('401s UNAUTHENTICATED when the correct password is given but the user has no active role membership', async () => {
    const { users, roleMemberships, useCase } = setup();
    users.findByPhone.mockResolvedValue({ id: 'user-1', phone: '+201001234567', password_hash: 'hashed' });
    verifyMock.mockResolvedValue(true);
    roleMemberships.findActiveByUser.mockResolvedValue([]);

    await expect(useCase.execute({ phone: '+201001234567', password: 'NewPass1!' })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      httpStatus: 401,
    });
  });

  it('on a correct password: verifies against the stored hash, reuses the active membership, and issues tokens', async () => {
    const { tx, users, roleMemberships, tokens, useCase } = setup();
    const user = { id: 'user-1', phone: '+201001234567', password_hash: 'hashed' };
    users.findByPhone.mockResolvedValue(user);
    verifyMock.mockResolvedValue(true);
    const membership = { id: 'membership-1', user_id: 'user-1', role_code: 'PATIENT', context_type: 'PATIENT' };
    roleMemberships.findActiveByUser.mockResolvedValue([membership]);
    tokens.issue.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 1800 });

    const result = await useCase.execute({ phone: '+201001234567', password: 'NewPass1!' });

    expect(result).toEqual({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 1800, userId: 'user-1', role: 'PATIENT' });
    expect(verifyMock).toHaveBeenCalledWith('hashed', 'NewPass1!');
    expect(roleMemberships.findActiveByUser).toHaveBeenCalledWith(tx, 'user-1');
    expect(tokens.issue).toHaveBeenCalledWith(tx, membership);
  });

  it('selects the requested doctor membership instead of the oldest patient membership', async () => {
    const { tx, users, roleMemberships, tokens, useCase } = setup();
    users.findByPhone.mockResolvedValue({ id: 'user-1', phone: '+201001234567', password_hash: 'hashed' });
    verifyMock.mockResolvedValue(true);
    const membership = { id: 'doctor-membership', user_id: 'user-1', role_code: 'DOCTOR', context_type: 'DOCTOR' };
    roleMemberships.findActiveByUserRoleContextType.mockResolvedValue([membership]);
    tokens.issue.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 1800 });

    const result = await useCase.execute({ phone: '+201001234567', password: 'NewPass1!', role: 'DOCTOR' as any });

    expect(result.role).toBe('DOCTOR');
    expect(roleMemberships.findActiveByUserRoleContextType).toHaveBeenCalledWith(tx, {
      userId: 'user-1',
      roleCode: 'DOCTOR',
      contextType: 'DOCTOR',
    });
    expect(tokens.issue).toHaveBeenCalledWith(tx, membership);
  });

  it('selects the requested clinic assistant membership and preserves its owner scope', async () => {
    const { tx, users, roleMemberships, tokens, useCase } = setup();
    users.findByPhone.mockResolvedValue({ id: 'assistant-user', phone: '+201001234567', password_hash: 'hashed' });
    verifyMock.mockResolvedValue(true);
    const membership = {
      id: 'assistant-membership',
      user_id: 'assistant-user',
      role_code: 'CLINIC_STAFF',
      context_type: 'CLINIC_STAFF',
      context_id: 'doctor-1',
    };
    roleMemberships.findActiveByUserRoleContextType.mockResolvedValue([membership]);
    tokens.issue.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 1800 });

    const result = await useCase.execute({ phone: '+201001234567', password: 'NewPass1!', role: 'CLINIC_STAFF' as any });

    expect(result).toMatchObject({ userId: 'assistant-user', role: 'CLINIC_STAFF' });
    expect(tokens.issue).toHaveBeenCalledWith(tx, membership);
  });

  it('403s ROLE_NOT_PERMITTED when the requested role is not active', async () => {
    const { users, roleMemberships, useCase } = setup();
    users.findByPhone.mockResolvedValue({ id: 'user-1', phone: '+201001234567', password_hash: 'hashed' });
    verifyMock.mockResolvedValue(true);
    roleMemberships.findActiveByUserRoleContextType.mockResolvedValue([]);

    await expect(useCase.execute({ phone: '+201001234567', password: 'NewPass1!', role: 'DOCTOR' as any })).rejects.toMatchObject({
      code: 'ROLE_NOT_PERMITTED',
      httpStatus: 403,
    });
  });
});
