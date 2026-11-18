import { PrescriptionsController } from './prescriptions.controller';

const mk = (...n: string[]) => Object.fromEntries(n.map((x) => [x, jest.fn().mockResolvedValue(x)])) as any;
const file = (over: any = {}) => ({ buffer: Buffer.from('x'), originalname: 'a.png', mimetype: 'image/png', size: 1, ...over });

describe('PrescriptionsController', () => {
  const upload = mk('execute', 'executeForProvider');
  const get = mk('execute');
  const create = mk('execute', 'executeBatch');
  const approve = mk('execute');
  const reject = mk('execute');
  const getProv = mk('execute');
  const listProv = mk('execute');
  const c = new PrescriptionsController(upload, get, create, approve, reject, getProv, listProv);
  const user: any = { sub: 'u' };

  it('delegates provider handlers', async () => {
    await c.createForProvider({ a: 1 } as any, user);
    expect(create.execute).toHaveBeenCalledWith({ a: 1 }, user);
    await c.createBatchForProvider({ requests: [1] } as any, user);
    expect(create.executeBatch).toHaveBeenCalledWith([1], user);
    await c.listForProvider({} as any, user);
    await c.getForProvider('p', user);
    await c.approveForProvider('p', { expectedVersion: 4 } as any, user);
    expect(approve.execute).toHaveBeenCalledWith('p', 4, user);
    await c.rejectForProvider('p', { reason: 'r' } as any, user);
    expect(reject.execute).toHaveBeenCalledWith('p', { reason: 'r' }, user);
    await c.get('p', user);
    expect(get.execute).toHaveBeenCalledWith('p', user);
    expect(listProv.execute).toHaveBeenCalled();
    expect(getProv.execute).toHaveBeenCalled();
  });

  it('upload validates files and forwards notes', async () => {
    await c.upload([file()] as any, { notes: 'n' } as any, user);
    expect(upload.execute).toHaveBeenCalledWith({ files: [expect.objectContaining({ originalName: 'a.png' })], notes: 'n' }, user);
  });

  it('upload treats missing files as empty and rejects them', () => {
    expect(() => c.upload(undefined as any, {} as any, user)).toThrow(expect.objectContaining({ code: 'FILE_REQUIRED' }));
  });

  it('upload rejects invalid mime type', () => {
    expect(() => c.upload([file({ mimetype: 'text/plain' })] as any, {} as any, user)).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_FILE_TYPE' }));
  });

  it('uploadForProvider rejects missing or empty files', () => {
    expect(() => c.uploadForProvider([] as any, {} as any, user)).toThrow();
    expect(() => c.uploadForProvider(undefined as any, {} as any, user)).toThrow();
  });

  it('uploadForProvider forwards document metadata', async () => {
    await c.uploadForProvider([file()] as any, { patientId: 'pt', documentType: 'PRESCRIPTION', appointmentId: 'a', notes: 'n' } as any, user);
    expect(upload.executeForProvider).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'pt', documentType: 'PRESCRIPTION', appointmentId: 'a', notes: 'n' }), user);
  });
});
