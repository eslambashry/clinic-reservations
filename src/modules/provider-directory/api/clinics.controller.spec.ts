import { ClinicsController } from './clinics.controller';

const user = { sub: 'u1', contextType: 'ADMIN' } as never;
const id = 'c-1';

function setup() {
  const uc = {
    create: { execute: jest.fn() }, update: { execute: jest.fn() }, verify: { execute: jest.fn() },
    suspend: { execute: jest.fn() }, get: { execute: jest.fn() }, branch: { execute: jest.fn() },
  };
  const c = new ClinicsController(uc.create as never, uc.update as never, uc.verify as never, uc.suspend as never, uc.get as never, uc.branch as never);
  return { c, uc };
}

describe('ClinicsController', () => {
  it('get forwards context type or undefined', async () => {
    const { c, uc } = setup();
    uc.get.execute.mockResolvedValue({ id });
    await expect(c.get(id, user)).resolves.toEqual({ id });
    expect(uc.get.execute).toHaveBeenLastCalledWith(id, 'ADMIN');
    await c.get(id, undefined);
    expect(uc.get.execute).toHaveBeenLastCalledWith(id, undefined);
  });

  it('create delegates', async () => {
    const { c, uc } = setup();
    uc.create.execute.mockResolvedValue({ id });
    const dto = {} as never;
    await expect(c.create(dto, user)).resolves.toEqual({ id });
    expect(uc.create.execute).toHaveBeenCalledWith(dto, user);
  });

  it('update / verify / suspend return void', async () => {
    const { c, uc } = setup();
    const dto = {} as never;
    await expect(c.update(id, dto, user)).resolves.toBeUndefined();
    expect(uc.update.execute).toHaveBeenCalledWith(id, dto, user);
    await expect(c.verify(id, user)).resolves.toBeUndefined();
    expect(uc.verify.execute).toHaveBeenCalledWith(id, user);
    await expect(c.suspend(id, user)).resolves.toBeUndefined();
    expect(uc.suspend.execute).toHaveBeenCalledWith(id, user);
  });

  it('createClinicBranch delegates', async () => {
    const { c, uc } = setup();
    uc.branch.execute.mockResolvedValue({ id: 'b' });
    const dto = {} as never;
    await expect(c.createClinicBranch(id, dto, user)).resolves.toEqual({ id: 'b' });
    expect(uc.branch.execute).toHaveBeenCalledWith(id, dto, user);
  });
});
