import { AssistantsController } from './assistants.controller';

const user = { sub: 'u1' } as never;

describe('AssistantsController', () => {
  const l = { execute: jest.fn() };
  const cr = { execute: jest.fn() };
  const up = { execute: jest.fn() };
  const del = { execute: jest.fn() };
  const c = new AssistantsController(l as never, cr as never, up as never, del as never);

  it('list wraps items', async () => {
    l.execute.mockResolvedValue([{ id: 'a' }]);
    await expect(c.list(user)).resolves.toEqual({ items: [{ id: 'a' }] });
    expect(l.execute).toHaveBeenCalledWith(user);
  });

  it('create delegates', async () => {
    cr.execute.mockResolvedValue({ id: 'a' });
    const dto = {} as never;
    await expect(c.create(dto, user)).resolves.toEqual({ id: 'a' });
    expect(cr.execute).toHaveBeenCalledWith(dto, user);
  });

  it('update delegates', async () => {
    up.execute.mockResolvedValue({ id: 'a' });
    const dto = {} as never;
    await expect(c.update('a', dto, user)).resolves.toEqual({ id: 'a' });
    expect(up.execute).toHaveBeenCalledWith('a', dto, user);
  });

  it('remove returns void', async () => {
    await expect(c.remove('a', user)).resolves.toBeUndefined();
    expect(del.execute).toHaveBeenCalledWith('a', user);
  });
});
