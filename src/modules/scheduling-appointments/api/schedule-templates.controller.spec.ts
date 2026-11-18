import { ScheduleTemplatesController } from './schedule-templates.controller';

describe('ScheduleTemplatesController', () => {
  const user = { sub: 'u1' } as any;
  const create = { execute: jest.fn().mockResolvedValue('created') };
  const update = { execute: jest.fn().mockResolvedValue({}) };
  const del = { execute: jest.fn().mockResolvedValue({}) };
  const list = { execute: jest.fn().mockResolvedValue(['t']) };
  const controller = new ScheduleTemplatesController(create as any, update as any, del as any, list as any);

  it('create delegates', async () => {
    const dto = {} as any;
    await expect(controller.create(dto, user)).resolves.toBe('created');
    expect(create.execute).toHaveBeenCalledWith(dto, user);
  });

  it('list passes the affiliationId', async () => {
    await expect(controller.list({ affiliationId: 'a1' } as any)).resolves.toEqual(['t']);
    expect(list.execute).toHaveBeenCalledWith('a1');
  });

  it('update returns void', async () => {
    const dto = {} as any;
    await expect(controller.update('t1', dto, user)).resolves.toBeUndefined();
    expect(update.execute).toHaveBeenCalledWith('t1', dto, user);
  });

  it('remove returns void', async () => {
    await expect(controller.remove('t1', user)).resolves.toBeUndefined();
    expect(del.execute).toHaveBeenCalledWith('t1', user);
  });
});
