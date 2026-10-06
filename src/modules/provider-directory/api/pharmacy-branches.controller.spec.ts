import { PharmacyBranchesController } from './pharmacy-branches.controller';

const user = { sub: 'u1', contextType: 'ADMIN' } as never;

describe('PharmacyBranchesController', () => {
  const update = { execute: jest.fn() };
  const get = { execute: jest.fn() };
  const search = { execute: jest.fn() };
  const c = new PharmacyBranchesController(update as never, get as never, search as never);

  it('search delegates', async () => {
    search.execute.mockResolvedValue({ items: [] });
    const q = {} as never;
    await expect(c.search(q)).resolves.toEqual({ items: [] });
    expect(search.execute).toHaveBeenCalledWith(q);
  });

  it('get forwards context type or undefined', async () => {
    get.execute.mockResolvedValue({ id: 'b' });
    await c.get('b', user);
    expect(get.execute).toHaveBeenLastCalledWith('b', 'ADMIN');
    await c.get('b', undefined);
    expect(get.execute).toHaveBeenLastCalledWith('b', undefined);
  });

  it('update returns void', async () => {
    const dto = {} as never;
    await expect(c.update('b', dto, user)).resolves.toBeUndefined();
    expect(update.execute).toHaveBeenCalledWith('b', dto, user);
  });
});
