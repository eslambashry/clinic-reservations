import { DomainError } from '../../../shared/core/errors/domain-errors';
import { VerificationDocumentsController } from './verification-documents.controller';

const user = { sub: 'u1' } as never;

describe('VerificationDocumentsController', () => {
  const m = () => ({ execute: jest.fn() });
  const upload = m();
  const list = m();
  const approve = m();
  const reject = m();
  const c = new VerificationDocumentsController(upload as never, list as never, approve as never, reject as never);
  const file = { buffer: Buffer.from('x'), originalname: 'a.pdf', mimetype: 'application/pdf', size: 10 } as Express.Multer.File;

  beforeEach(() => jest.clearAllMocks());

  it('list delegates', async () => {
    list.execute.mockResolvedValue({ items: [] });
    const q = {} as never;
    await expect(c.list(q)).resolves.toEqual({ items: [] });
    expect(list.execute).toHaveBeenCalledWith(q);
  });

  it('upload maps the multer file and delegates', async () => {
    upload.execute.mockResolvedValue({ id: 'd' });
    const dto = { providerId: 'p' } as never;
    await expect(c.upload(file, dto, user)).resolves.toEqual({ id: 'd' });
    expect(upload.execute).toHaveBeenCalledWith(
      { providerId: 'p', file: { buffer: file.buffer, originalName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10 } },
      user,
    );
  });

  it('upload rejects a missing file', () => {
    expect(() => c.upload(undefined, {} as never, user)).toThrow(DomainError);
    expect(upload.execute).not.toHaveBeenCalled();
  });

  it('upload rejects an unsupported mime type', () => {
    expect(() => c.upload({ ...file, mimetype: 'text/plain' }, {} as never, user)).toThrow(DomainError);
    expect(upload.execute).not.toHaveBeenCalled();
  });

  it('approve returns void', async () => {
    await expect(c.approve('d', user)).resolves.toBeUndefined();
    expect(approve.execute).toHaveBeenCalledWith('d', user);
  });

  it('reject passes the reason code', async () => {
    await expect(c.reject('d', { reasonCode: 'BLURRY' } as never, user)).resolves.toBeUndefined();
    expect(reject.execute).toHaveBeenCalledWith('d', 'BLURRY', user);
  });
});
