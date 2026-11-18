import { DoctorClinicsController } from './doctor-clinics.controller';

const user = { sub: 'u1' } as never;

describe('DoctorClinicsController', () => {
  const m = () => ({ execute: jest.fn() });
  const list = m();
  const upBranch = m();
  const upAff = m();
  const crBranch = m();
  const delBranch = m();
  const c = new DoctorClinicsController(list as never, upBranch as never, upAff as never, crBranch as never, delBranch as never);

  it('list', async () => {
    list.execute.mockResolvedValue({ items: [] });
    await expect(c.list(user)).resolves.toEqual({ items: [] });
    expect(list.execute).toHaveBeenCalledWith(user);
  });

  it('createBranch merges clinicId and keeps a provided currency', async () => {
    crBranch.execute.mockResolvedValue({ id: 'x' });
    await c.createBranch('c1', { name: 'n', currency: 'USD' } as never, user);
    expect(crBranch.execute).toHaveBeenLastCalledWith({ name: 'n', clinicId: 'c1', currency: 'USD' }, user);
  });

  it('createBranch defaults currency to EGP', async () => {
    await c.createBranch('c1', { name: 'n' } as never, user);
    expect(crBranch.execute).toHaveBeenLastCalledWith({ name: 'n', clinicId: 'c1', currency: 'EGP' }, user);
  });

  it('updateBranch', async () => {
    upBranch.execute.mockResolvedValue({ id: 'x' });
    const dto = {} as never;
    await expect(c.updateBranch('b', dto, user)).resolves.toEqual({ id: 'x' });
    expect(upBranch.execute).toHaveBeenCalledWith('b', dto, user);
  });

  it('updateAffiliation', async () => {
    upAff.execute.mockResolvedValue({ id: 'x' });
    const dto = {} as never;
    await expect(c.updateAffiliation('a', dto, user)).resolves.toEqual({ id: 'x' });
    expect(upAff.execute).toHaveBeenCalledWith('a', dto, user);
  });

  it('deleteBranch returns void', async () => {
    await expect(c.deleteBranch('b', user)).resolves.toBeUndefined();
    expect(delBranch.execute).toHaveBeenCalledWith('b', user);
  });
});
