import { PharmacyStaffController } from './pharmacy-staff.controller';

const user = { sub: 'u1' } as never;

describe('PharmacyStaffController', () => {
  const g = { execute: jest.fn() };
  const cr = { execute: jest.fn() };
  const up = { execute: jest.fn() };
  const del = { execute: jest.fn() };
  const c = new PharmacyStaffController(g as never, cr as never, up as never, del as never);

  it('get delegates (null allowed)', async () => {
    g.execute.mockResolvedValue(null);
    await expect(c.get('p')).resolves.toBeNull();
    expect(g.execute).toHaveBeenCalledWith('p');
  });

  it('create delegates', async () => {
    cr.execute.mockResolvedValue({ id: 's' });
    const dto = {} as never;
    await expect(c.create('p', dto, user)).resolves.toEqual({ id: 's' });
    expect(cr.execute).toHaveBeenCalledWith('p', dto, user);
  });

  it('update delegates', async () => {
    up.execute.mockResolvedValue({ id: 's' });
    const dto = {} as never;
    await expect(c.update('p', 's', dto, user)).resolves.toEqual({ id: 's' });
    expect(up.execute).toHaveBeenCalledWith('p', 's', dto, user);
  });

  it('remove returns void', async () => {
    await expect(c.remove('p', 's', user)).resolves.toBeUndefined();
    expect(del.execute).toHaveBeenCalledWith('p', 's', user);
  });
});
