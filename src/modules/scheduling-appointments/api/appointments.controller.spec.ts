import { AppointmentsController } from './appointments.controller';

describe('AppointmentsController', () => {
  const user = { sub: 'u1' } as any;
  const mk = () => ({ execute: jest.fn().mockResolvedValue('result') });
  const uc = {
    createHold: mk(), confirm: mk(), cancel: mk(), reschedule: mk(), list: mk(), get: mk(), pay: mk(),
  };
  const controller = new AppointmentsController(
    uc.createHold as any, uc.confirm as any, uc.cancel as any, uc.reschedule as any, uc.list as any, uc.get as any, uc.pay as any,
  );

  it('hold delegates to CreateHoldUseCase', async () => {
    const dto = { slotId: 's' } as any;
    await expect(controller.hold(dto, user)).resolves.toBe('result');
    expect(uc.createHold.execute).toHaveBeenCalledWith(dto, user);
  });

  it('confirm delegates with holdId', async () => {
    const dto = {} as any;
    await expect(controller.confirm('h1', dto, user)).resolves.toBe('result');
    expect(uc.confirm.execute).toHaveBeenCalledWith('h1', dto, user);
  });

  it('payForHold delegates with holdId', async () => {
    const dto = {} as any;
    await expect(controller.payForHold('h1', dto, user)).resolves.toBe('result');
    expect(uc.pay.execute).toHaveBeenCalledWith('h1', dto, user);
  });

  it('cancel delegates', async () => {
    const dto = {} as any;
    await expect(controller.cancel('a1', dto, user)).resolves.toBe('result');
    expect(uc.cancel.execute).toHaveBeenCalledWith('a1', dto, user);
  });

  it('reschedule delegates', async () => {
    const dto = {} as any;
    await expect(controller.reschedule('a1', dto, user)).resolves.toBe('result');
    expect(uc.reschedule.execute).toHaveBeenCalledWith('a1', dto, user);
  });

  it('list delegates', async () => {
    const q = {} as any;
    await expect(controller.list(q, user)).resolves.toBe('result');
    expect(uc.list.execute).toHaveBeenCalledWith(q, user);
  });

  it('get delegates', async () => {
    await expect(controller.get('a1', user)).resolves.toBe('result');
    expect(uc.get.execute).toHaveBeenCalledWith('a1', user);
  });
});
