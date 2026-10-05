import { SwitchContextUseCase } from './switch-context.use-case';

describe('SwitchContextUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const roleMemberships = { findActiveByUser: jest.fn() };
    const tokens = { issue: jest.fn() };
    const refreshTokens = { lockUserForAuthMutation: jest.fn(), lockLiveSession: jest.fn().mockResolvedValue(true) };
    const useCase = new SwitchContextUseCase(prisma as any, roleMemberships as any, tokens as any, refreshTokens as any);
    return { tx, prisma, roleMemberships, tokens, refreshTokens, useCase };
  }

  it('issues fresh tokens for a membership the caller already holds', async () => {
    const { tx, roleMemberships, tokens, refreshTokens, useCase } = setup();
    const patientMembership = { id: 'm-patient', context_type: 'PATIENT' };
    const doctorMembership = { id: 'm-doctor', context_type: 'DOCTOR' };
    roleMemberships.findActiveByUser.mockResolvedValue([doctorMembership, patientMembership]);
    tokens.issue.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', expiresIn: 900 });

    const result = await useCase.execute('user-1', { contextType: 'PATIENT' as any }, 'session-1');

    expect(roleMemberships.findActiveByUser).toHaveBeenCalledWith(tx, 'user-1');
    expect(refreshTokens.lockUserForAuthMutation).toHaveBeenCalledWith(tx, 'user-1');
    expect(refreshTokens.lockLiveSession).toHaveBeenCalledWith(tx, 'user-1', 'session-1');
    // Stays in the caller's login session so a later logout ends both pairs.
    expect(tokens.issue).toHaveBeenCalledWith(tx, patientMembership, undefined, 'session-1');
    expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresIn: 900 });
  });

  it('rejects switching into a context the caller has no active membership for', async () => {
    const { roleMemberships, tokens, useCase } = setup();
    roleMemberships.findActiveByUser.mockResolvedValue([{ id: 'm-patient', context_type: 'PATIENT' }]);

    await expect(useCase.execute('user-1', { contextType: 'ADMIN' as any }, 'session-1')).rejects.toMatchObject({
      httpStatus: 403,
      code: 'CONTEXT_NOT_AVAILABLE',
    });
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it('cannot recreate a logged-out session from an access token carrying its old sid', async () => {
    const { refreshTokens, tokens, useCase } = setup();
    refreshTokens.lockLiveSession.mockResolvedValue(false);

    await expect(useCase.execute('user-1', { contextType: 'PATIENT' as any }, 'revoked-session'))
      .rejects.toMatchObject({ httpStatus: 409, code: 'DEVICE_SESSION_ENDED' });
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it('requires a session claim on legacy access tokens before switching context', async () => {
    const { prisma, tokens, useCase } = setup();

    await expect(useCase.execute('user-1', { contextType: 'PATIENT' as any }))
      .rejects.toMatchObject({ httpStatus: 401, code: 'SESSION_REFRESH_REQUIRED' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tokens.issue).not.toHaveBeenCalled();
  });
});
