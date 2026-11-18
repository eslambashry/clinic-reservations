import { BusinessRuleError } from '../../../shared/core/errors/domain-errors';
import { LEGAL_VERSION } from '../domain/legal.constants';
import { AcceptLegalUseCase } from './accept-legal.use-case';

describe('AcceptLegalUseCase', () => {
  function setup(existing: unknown = null) {
    const prisma = { consent: { findFirst: jest.fn().mockResolvedValue(existing), create: jest.fn() } };
    return { prisma, useCase: new AcceptLegalUseCase(prisma as any) };
  }

  it('records one versioned consent per document', async () => {
    const { prisma, useCase } = setup();
    await useCase.execute('u1', LEGAL_VERSION);
    expect(prisma.consent.create.mock.calls.map((c) => c[0].data)).toEqual([
      { patient_id: 'u1', consent_type: `TERMS_OF_SERVICE:${LEGAL_VERSION}`, granted: true },
      { patient_id: 'u1', consent_type: `PRIVACY_POLICY:${LEGAL_VERSION}`, granted: true },
    ]);
  });

  it('is idempotent when already accepted', async () => {
    const { prisma, useCase } = setup({ id: 'c1' });
    await useCase.execute('u1', LEGAL_VERSION);
    expect(prisma.consent.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown version', async () => {
    const { prisma, useCase } = setup();
    await expect(useCase.execute('u1', '0.1')).rejects.toBeInstanceOf(BusinessRuleError);
    expect(prisma.consent.create).not.toHaveBeenCalled();
  });
});
