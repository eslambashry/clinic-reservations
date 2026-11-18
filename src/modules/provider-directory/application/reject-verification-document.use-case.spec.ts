import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { RejectVerificationDocumentUseCase } from './reject-verification-document.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm1' } as any;

describe('RejectVerificationDocumentUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const documents = { findById: jest.fn().mockResolvedValue({ id: 'd1', version: 2 }), setDecision: jest.fn() };
    const audit = { record: jest.fn() };
    return { tx, documents, audit, useCase: new RejectVerificationDocumentUseCase(prisma as any, documents as any, audit as any) };
  }

  it('404s when document missing', async () => {
    const { useCase, documents, audit } = setup();
    documents.findById.mockResolvedValue(null);
    await expect(useCase.execute('d1', 'BLURRY', actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects and audits with the reason code', async () => {
    const { tx, useCase, documents, audit } = setup();
    await useCase.execute('d1', 'BLURRY', actor);
    expect(documents.setDecision).toHaveBeenCalledWith(tx, 'd1', 2, 'REJECTED', 'a1');
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ reasonCode: 'BLURRY', resourceId: 'd1' }));
  });
});
