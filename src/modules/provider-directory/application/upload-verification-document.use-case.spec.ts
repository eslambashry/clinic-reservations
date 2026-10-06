import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { UploadVerificationDocumentUseCase } from './upload-verification-document.use-case';

const admin = { sub: 'a1', roleMembershipId: 'rm-a', contextType: 'ADMIN' } as any;
const patient = { sub: 'u1', roleMembershipId: 'rm-p', contextType: 'PATIENT' } as any;
const file = { buffer: Buffer.from('x'), originalname: 'f.pdf', mimetype: 'application/pdf' } as any;

describe('UploadVerificationDocumentUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const documents = { create: jest.fn().mockResolvedValue({ id: 'd1', file_url: 'raw-url' }) };
    const doctors = { findById: jest.fn().mockResolvedValue({ id: 'doc1' }), findByUserId: jest.fn().mockResolvedValue({ id: 'doc1' }) };
    const clinics = { findById: jest.fn().mockResolvedValue({ id: 'c1' }) };
    const pharmacies = { findById: jest.fn().mockResolvedValue({ id: 'p1' }) };
    const audit = { record: jest.fn() };
    const media = { upload: jest.fn().mockResolvedValue({ url: 'raw-url' }), getSignedUrl: jest.fn().mockReturnValue('signed') };
    const useCase = new UploadVerificationDocumentUseCase(
      prisma as any, documents as any, doctors as any, clinics as any, pharmacies as any, audit as any, media as any,
    );
    return { prisma, documents, doctors, clinics, pharmacies, audit, media, useCase };
  }

  it('admin uploads for a clinic and gets a signed url', async () => {
    const { useCase, media, documents, audit } = setup();
    const res = await useCase.execute({ providerType: 'CLINIC', providerId: 'c1', docType: 'LICENSE', file }, admin);
    expect(media.upload).toHaveBeenCalledWith(file, { folder: 'provider-verification/CLINIC/c1', isPrivate: true });
    expect(documents.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fileUrl: 'raw-url' }));
    expect(audit.record).toHaveBeenCalled();
    expect(res.file_url).toBe('signed');
  });

  it('admin uploads for a pharmacy', async () => {
    const { useCase, pharmacies } = setup();
    await useCase.execute({ providerType: 'PHARMACY', providerId: 'p1', docType: 'L', file }, admin);
    expect(pharmacies.findById).toHaveBeenCalled();
  });

  it.each([
    ['DOCTOR', 'doctors'],
    ['CLINIC', 'clinics'],
    ['PHARMACY', 'pharmacies'],
  ])('404s for missing %s and does not upload', async (type, repo) => {
    const s: any = setup();
    s[repo].findById.mockResolvedValue(null);
    await expect(s.useCase.execute({ providerType: type, providerId: 'x', docType: 'L', file }, admin)).rejects.toBeInstanceOf(NotFoundError);
    expect(s.media.upload).not.toHaveBeenCalled();
  });

  it('rejects LAB', async () => {
    const { useCase } = setup();
    await expect(useCase.execute({ providerType: 'LAB', providerId: 'x', docType: 'L', file }, admin)).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('non-admin cannot upload for non-doctor providers', async () => {
    const { useCase, media } = setup();
    await expect(useCase.execute({ providerType: 'CLINIC', providerId: 'c1', docType: 'L', file }, patient)).rejects.toBeInstanceOf(ForbiddenError);
    expect(media.upload).not.toHaveBeenCalled();
  });

  it('non-admin without a doctor record is forbidden', async () => {
    const { useCase, doctors } = setup();
    doctors.findByUserId.mockResolvedValue(null);
    await expect(useCase.execute({ providerType: 'DOCTOR', providerId: 'doc1', docType: 'L', file }, patient)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('non-admin cannot upload for another doctor', async () => {
    const { useCase, doctors } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'other' });
    await expect(useCase.execute({ providerType: 'DOCTOR', providerId: 'doc1', docType: 'L', file }, patient)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('pending doctor uploads for own record', async () => {
    const { useCase, documents } = setup();
    await useCase.execute({ providerType: 'DOCTOR', providerId: 'doc1', docType: 'L', file }, patient);
    expect(documents.create).toHaveBeenCalled();
  });
});
