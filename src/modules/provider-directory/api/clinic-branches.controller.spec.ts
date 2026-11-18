import { ClinicBranchesController } from './clinic-branches.controller';

const user = { sub: 'u1', contextType: 'ADMIN' } as never;

describe('ClinicBranchesController', () => {
  const update = { execute: jest.fn() };
  const get = { execute: jest.fn() };
  const c = new ClinicBranchesController(update as never, get as never);

  it('get forwards context type or undefined', async () => {
    get.execute.mockResolvedValue({ id: 'b' });
    await expect(c.get('b', user)).resolves.toEqual({ id: 'b' });
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
