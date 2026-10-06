import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { ApproveVerificationDocumentUseCase } from './approve-verification-document.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm1' } as any;

describe('ApproveVerificationDocumentUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const documents = { findById: jest.fn().mockResolvedValue({ id: 'd1', version: 2 }), setDecision: jest.fn() };
    const audit = { record: jest.fn() };
    return { tx, documents, audit, useCase: new ApproveVerificationDocumentUseCase(prisma as any, documents as any, audit as any) };
  }

  it('404s when document missing', async () => {
    const { useCase, documents, audit } = setup();
    documents.findById.mockResolvedValue(null);
    await expect(useCase.execute('d1', actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('approves and audits', async () => {
    const { tx, useCase, documents, audit } = setup();
    await useCase.execute('d1', actor);
    expect(documents.setDecision).toHaveBeenCalledWith(tx, 'd1', 2, 'APPROVED', 'a1');
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'provider_directory.verification_document.approve', resourceId: 'd1' }));
  });
});
