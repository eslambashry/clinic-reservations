import { SpecialtiesController } from './specialties.controller';

const user = { sub: 'u1' } as never;

describe('SpecialtiesController', () => {
  const m = () => ({ execute: jest.fn() });
  const list = m();
  const listAdmin = m();
  const getAdmin = m();
  const create = m();
  const update = m();
  const del = m();
  const c = new SpecialtiesController(list as never, listAdmin as never, getAdmin as never, create as never, update as never, del as never);

  it('list', async () => {
    list.execute.mockResolvedValue([1]);
    await expect(c.list()).resolves.toEqual([1]);
  });
  it('listAdmin', async () => {
    listAdmin.execute.mockResolvedValue({ items: [] });
    const q = {} as never;
    await expect(c.listAdmin(q)).resolves.toEqual({ items: [] });
    expect(listAdmin.execute).toHaveBeenCalledWith(q);
  });
  it('getAdmin', async () => {
    getAdmin.execute.mockResolvedValue({ code: 'x' });
    await expect(c.getAdmin('x')).resolves.toEqual({ code: 'x' });
    expect(getAdmin.execute).toHaveBeenCalledWith('x');
  });
  it('create', async () => {
    create.execute.mockResolvedValue({ code: 'x' });
    const dto = {} as never;
    await expect(c.create(dto, user)).resolves.toEqual({ code: 'x' });
    expect(create.execute).toHaveBeenCalledWith(dto, user);
  });
  it('update', async () => {
    update.execute.mockResolvedValue({ code: 'x' });
    const dto = {} as never;
    await expect(c.update('x', dto, user)).resolves.toEqual({ code: 'x' });
    expect(update.execute).toHaveBeenCalledWith('x', dto, user);
  });
  it('remove', async () => {
    await expect(c.remove('x', user)).resolves.toBeUndefined();
    expect(del.execute).toHaveBeenCalledWith('x', user);
  });
});
