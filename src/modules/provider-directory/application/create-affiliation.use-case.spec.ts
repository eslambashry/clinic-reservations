import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CreateAffiliationUseCase } from './create-affiliation.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm1' } as any;
const input = { clinicBranchId: 'br1', consultFee: '100.00', currency: 'EGP' };

describe('CreateAffiliationUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const doctors = { findById: jest.fn().mockResolvedValue({ id: 'd1' }) };
    const branches = { findById: jest.fn().mockResolvedValue({ id: 'br1' }) };
    const affiliations = { create: jest.fn().mockResolvedValue({ id: 'aff1' }) };
    const audit = { record: jest.fn() };
    const useCase = new CreateAffiliationUseCase(prisma as any, doctors as any, branches as any, affiliations as any, audit as any);
    return { tx, doctors, branches, affiliations, audit, useCase };
  }

  it('creates and audits', async () => {
    const { tx, useCase, affiliations, audit } = setup();
    await expect(useCase.execute('d1', input, actor)).resolves.toEqual({ id: 'aff1' });
    expect(affiliations.create).toHaveBeenCalledWith(tx, { doctorId: 'd1', ...input });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ resourceId: 'aff1' }));
  });

  it('404s on missing doctor', async () => {
    const { useCase, doctors, affiliations } = setup();
    doctors.findById.mockResolvedValue(null);
    await expect(useCase.execute('d1', input, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(affiliations.create).not.toHaveBeenCalled();
  });

  it('404s on missing branch', async () => {
    const { useCase, branches } = setup();
    branches.findById.mockResolvedValue(null);
    await expect(useCase.execute('d1', input, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('maps P2002 to a conflict', async () => {
    const { useCase, affiliations, audit } = setup();
    affiliations.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    await expect(useCase.execute('d1', input, actor)).rejects.toBeInstanceOf(ConflictError);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rethrows other Prisma errors', async () => {
    const { useCase, affiliations } = setup();
    const err = new Prisma.PrismaClientKnownRequestError('other', { code: 'P2025', clientVersion: 'x' });
    affiliations.create.mockRejectedValue(err);
    await expect(useCase.execute('d1', input, actor)).rejects.toBe(err);
  });

  it('rethrows non-Prisma errors', async () => {
    const { useCase, affiliations } = setup();
    const err = new Error('boom');
    affiliations.create.mockRejectedValue(err);
    await expect(useCase.execute('d1', input, actor)).rejects.toBe(err);
  });
});
