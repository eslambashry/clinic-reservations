import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { UpdateMyAffiliationUseCase } from './update-my-affiliation.use-case';

const actor = { sub: 'u1', roleMembershipId: 'rm1' } as any;

describe('UpdateMyAffiliationUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const scope = { execute: jest.fn().mockResolvedValue({ affiliationIds: ['aff1'] }) };
    const affiliations = { findById: jest.fn().mockResolvedValue({ id: 'aff1', version: 3 }), update: jest.fn() };
    const audit = { record: jest.fn() };
    const list = { execute: jest.fn().mockResolvedValue({ items: [{ affiliationId: 'aff1' }] }) };
    const useCase = new UpdateMyAffiliationUseCase(prisma as any, scope as any, affiliations as any, audit as any, list as any);
    return { tx, scope, affiliations, audit, list, useCase };
  }

  it('404s when affiliation is not owned by the doctor', async () => {
    const { useCase, affiliations } = setup();
    await expect(useCase.execute('other', { status: 'PAUSED' }, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(affiliations.update).not.toHaveBeenCalled();
  });

  it('404s when row vanished', async () => {
    const { useCase, affiliations } = setup();
    affiliations.findById.mockResolvedValue(null);
    await expect(useCase.execute('aff1', { status: 'PAUSED' }, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updates status and fee with optimistic version', async () => {
    const { tx, useCase, affiliations, audit } = setup();
    const res = await useCase.execute('aff1', { status: 'ACTIVE', consultFee: 99.5 }, actor);
    expect(affiliations.update).toHaveBeenCalledWith(tx, 'aff1', 3, { status: 'ACTIVE', consultFee: '99.50' });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ reasonCode: 'ACTIVE' }));
    expect(res).toEqual({ affiliationId: 'aff1' });
  });

  it('leaves fee undefined when omitted', async () => {
    const { useCase, affiliations } = setup();
    await useCase.execute('aff1', { status: 'PAUSED' }, actor);
    expect(affiliations.update).toHaveBeenCalledWith(expect.anything(), 'aff1', 3, { status: 'PAUSED', consultFee: undefined });
  });

  it('404s when refreshed list lacks the row', async () => {
    const { useCase, list } = setup();
    list.execute.mockResolvedValue({ items: [] });
    await expect(useCase.execute('aff1', { status: 'PAUSED' }, actor)).rejects.toBeInstanceOf(NotFoundError);
  });
});
