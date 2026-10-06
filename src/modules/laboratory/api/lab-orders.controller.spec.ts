import { LabOrdersController } from './lab-orders.controller';

const NAMES = [
  'createLabOrder',
  'createProviderLabOrder',
  'listLabOrders',
  'getLabOrder',
  'submitQuote',
  'confirmBooking',
  'recordArrival',
  'dispatchCourier',
  'collectSample',
  'rescheduleVisit',
  'startAnalysis',
  'recordResult',
  'setCriticalFlag',
  'rejectSample',
  'requestRecollection',
  'rejectLabOrder',
  'addOperationalNote',
  'recordResultDelivery',
] as const;

function setup() {
  const uc: Record<string, { execute: jest.Mock; executeBatch?: jest.Mock }> = {};
  for (const n of NAMES) {
    uc[n] = { execute: jest.fn().mockResolvedValue({ ok: n }) };
  }
  uc.createProviderLabOrder.executeBatch = jest.fn().mockResolvedValue({ batch: true });
  const controller = new LabOrdersController(...(NAMES.map((n) => uc[n]) as [any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any]));
  return { uc, controller };
}

const user = { sub: 'u1', roleMembershipId: 'rm1' } as any;
const ID = '11111111-1111-1111-1111-111111111111';
const RES = '22222222-2222-2222-2222-222222222222';

describe('LabOrdersController', () => {
  it('list / get delegate with the caller', async () => {
    const { uc, controller } = setup();
    const query = { limit: 5 } as any;
    await expect(controller.list(query, user)).resolves.toEqual({ ok: 'listLabOrders' });
    expect(uc.listLabOrders.execute).toHaveBeenCalledWith(query, user);
    await controller.get(ID, user);
    expect(uc.getLabOrder.execute).toHaveBeenCalledWith(ID, user);
  });

  it('create / createForPatient / createBatchForPatients', async () => {
    const { uc, controller } = setup();
    const dto = { a: 1 } as any;
    await controller.create(dto, user);
    expect(uc.createLabOrder.execute).toHaveBeenCalledWith(dto, user);
    await controller.createForPatient(dto, user);
    expect(uc.createProviderLabOrder.execute).toHaveBeenCalledWith(dto, user);
    await expect(controller.createBatchForPatients({ requests: [dto] } as any, user)).resolves.toEqual({ batch: true });
    expect(uc.createProviderLabOrder.executeBatch).toHaveBeenCalledWith([dto], user);
  });

  it.each([
    ['quote', 'submitQuote'],
    ['arrival', 'recordArrival'],
    ['dispatch', 'dispatchCourier'],
    ['collect', 'collectSample'],
    ['reschedule', 'rescheduleVisit'],
    ['startAnalysisRoute', 'startAnalysis'],
    ['rejectSampleRoute', 'rejectSample'],
    ['requestRecollectionRoute', 'requestRecollection'],
    ['reject', 'rejectLabOrder'],
    ['addNote', 'addOperationalNote'],
    ['recordDelivery', 'recordResultDelivery'],
  ])('%s passes (id, dto, user) to %s', async (method, useCaseName) => {
    const { uc, controller } = setup();
    const dto = { x: 1 } as any;
    await expect((controller as any)[method](ID, dto, user)).resolves.toEqual({ ok: useCaseName });
    expect(uc[useCaseName].execute).toHaveBeenCalledWith(ID, dto, user);
  });

  it('confirm passes (id, user)', async () => {
    const { uc, controller } = setup();
    await controller.confirm(ID, user);
    expect(uc.confirmBooking.execute).toHaveBeenCalledWith(ID, user);
  });

  it('criticalFlag passes order, result, dto and user', async () => {
    const { uc, controller } = setup();
    const dto = { isCritical: true } as any;
    await controller.criticalFlag(ID, RES, dto, user);
    expect(uc.setCriticalFlag.execute).toHaveBeenCalledWith(ID, RES, dto, user);
  });

  describe('results', () => {
    const file = { buffer: Buffer.from('x'), originalname: 'r.pdf', mimetype: 'application/pdf', size: 10 } as any;

    it('maps valid uploaded files into the use case payload', async () => {
      const { uc, controller } = setup();
      await controller.results(ID, [file], { fileLabel: 'CBC' } as any, user);
      expect(uc.recordResult.execute).toHaveBeenCalledWith(
        ID,
        { fileLabel: 'CBC', files: [{ buffer: file.buffer, originalName: 'r.pdf', mimeType: 'application/pdf', sizeBytes: 10 }] },
        user,
      );
    });

    it('skips file validation and sends an empty list when no files are uploaded', async () => {
      const { uc, controller } = setup();
      await controller.results(ID, undefined as any, { fileLabel: 'CBC' } as any, user);
      expect(uc.recordResult.execute).toHaveBeenCalledWith(ID, { fileLabel: 'CBC', files: [] }, user);
    });

    it('rejects an unsupported mime type before reaching the use case', async () => {
      const { uc, controller } = setup();
      const bad = { ...file, mimetype: 'text/plain' };
      expect(() => controller.results(ID, [bad], {} as any, user)).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_FILE_TYPE' }));
      expect(uc.recordResult.execute).not.toHaveBeenCalled();
    });
  });
});
