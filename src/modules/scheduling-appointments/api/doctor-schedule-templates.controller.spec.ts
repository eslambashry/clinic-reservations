import { DoctorScheduleTemplatesController } from './doctor-schedule-templates.controller';

describe('DoctorScheduleTemplatesController', () => {
  const user = { sub: 'u1' } as any;
  const list = { execute: jest.fn().mockResolvedValue('list') };
  const manage = {
    create: jest.fn().mockResolvedValue('created'),
    update: jest.fn().mockResolvedValue('updated'),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new DoctorScheduleTemplatesController(list as any, manage as any);

  it('list delegates', async () => {
    const q = {} as any;
    await expect(controller.list(q, user)).resolves.toBe('list');
    expect(list.execute).toHaveBeenCalledWith(q, user);
  });

  it('create delegates', async () => {
    const dto = {} as any;
    await expect(controller.create(dto, user)).resolves.toBe('created');
    expect(manage.create).toHaveBeenCalledWith(dto, user);
  });

  it('update delegates', async () => {
    const dto = {} as any;
    await expect(controller.update('t1', dto, user)).resolves.toBe('updated');
    expect(manage.update).toHaveBeenCalledWith('t1', dto, user);
  });

  it('remove passes the version and returns void', async () => {
    await expect(controller.remove('t1', { version: 3 } as any, user)).resolves.toBeUndefined();
    expect(manage.remove).toHaveBeenCalledWith('t1', 3, user);
  });
});
