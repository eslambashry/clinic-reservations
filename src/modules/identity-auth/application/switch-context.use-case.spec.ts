import { SwitchContextUseCase } from './switch-context.use-case';

describe('SwitchContextUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const roleMemberships = { findActiveByUser: jest.fn() };
    const tokens = { issue: jest.fn() };
    const useCase = new SwitchContextUseCase(prisma as any, roleMemberships as any, tokens as any);
    return { tx, prisma, roleMemberships, tokens, useCase };
  }

  it('issues fresh tokens for a membership the caller already holds', async () => {
    const { tx, roleMemberships, tokens, useCase } = setup();
    const patientMembership = { id: 'm-patient', context_type: 'PATIENT' };
    const doctorMembership = { id: 'm-doctor', context_type: 'DOCTOR' };
    roleMemberships.findActiveByUser.mockResolvedValue([doctorMembership, patientMembership]);
    tokens.issue.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', expiresIn: 900 });

    const result = await useCase.execute('user-1', { contextType: 'PATIENT' as any });

    expect(roleMemberships.findActiveByUser).toHaveBeenCalledWith(tx, 'user-1');
    expect(tokens.issue).toHaveBeenCalledWith(tx, patientMembership);
    expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresIn: 900 });
  });

  it('rejects switching into a context the caller has no active membership for', async () => {
    const { roleMemberships, tokens, useCase } = setup();
    roleMemberships.findActiveByUser.mockResolvedValue([{ id: 'm-patient', context_type: 'PATIENT' }]);

    await expect(useCase.execute('user-1', { contextType: 'ADMIN' as any })).rejects.toMatchObject({
      httpStatus: 403,
      code: 'CONTEXT_NOT_AVAILABLE',
    });
    expect(tokens.issue).not.toHaveBeenCalled();
  });
});
