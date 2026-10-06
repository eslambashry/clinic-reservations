import { DoctorSlotsController } from './doctor-slots.controller';

describe('DoctorSlotsController', () => {
  const uc = { execute: jest.fn().mockResolvedValue('slots') };
  const controller = new DoctorSlotsController(uc as any);
  const query = { clinicBranchId: 'b1', from: 'f', to: 't' } as any;

  it('passes the caller contextType when authenticated', async () => {
    await expect(controller.get('d1', query, { contextType: 'ADMIN' } as any)).resolves.toBe('slots');
    expect(uc.execute).toHaveBeenCalledWith('d1', 'b1', 'f', 't', 'ADMIN');
  });

  it('passes undefined contextType for anonymous callers', async () => {
    await controller.get('d1', query, undefined);
    expect(uc.execute).toHaveBeenLastCalledWith('d1', 'b1', 'f', 't', undefined);
  });
});
