import { DoctorsController } from './doctors.controller';

const user = { sub: 'u1', contextType: 'ADMIN' } as never;
const id = 'doc-1';

function setup() {
  const uc = {
    create: { execute: jest.fn() },
    update: { execute: jest.fn() },
    verify: { execute: jest.fn() },
    suspend: { execute: jest.fn() },
    reject: { execute: jest.fn() },
    get: { execute: jest.fn() },
    getMe: { execute: jest.fn() },
    updateMe: { execute: jest.fn() },
    search: { execute: jest.fn() },
    affiliation: { execute: jest.fn() },
    list: { execute: jest.fn() },
  };
  const c = new DoctorsController(
    uc.create as never, uc.update as never, uc.verify as never, uc.suspend as never, uc.reject as never,
    uc.get as never, uc.getMe as never, uc.updateMe as never, uc.search as never, uc.affiliation as never, uc.list as never,
  );
  return { c, uc };
}

describe('DoctorsController', () => {
  it('search delegates the query', async () => {
    const { c, uc } = setup();
    uc.search.execute.mockResolvedValue({ items: [] });
    const q = { limit: 5 } as never;
    await expect(c.search(q)).resolves.toEqual({ items: [] });
    expect(uc.search.execute).toHaveBeenCalledWith(q);
  });

  it('list delegates the query', async () => {
    const { c, uc } = setup();
    uc.list.execute.mockResolvedValue({ items: [1] });
    const q = {} as never;
    await expect(c.list(q)).resolves.toEqual({ items: [1] });
    expect(uc.list.execute).toHaveBeenCalledWith(q);
  });

  it('getMe passes the user', async () => {
    const { c, uc } = setup();
    uc.getMe.execute.mockResolvedValue({ id });
    await expect(c.getMe(user)).resolves.toEqual({ id });
    expect(uc.getMe.execute).toHaveBeenCalledWith(user);
  });

  it('updateMe maps photo_data_uri to photoDataUri', async () => {
    const { c, uc } = setup();
    uc.updateMe.execute.mockResolvedValue({ id });
    await c.updateMe(user, { bio: 'b', degree: 'd', experienceYears: 3, photo_data_uri: 'data:x' } as never);
    expect(uc.updateMe.execute).toHaveBeenCalledWith(user, { bio: 'b', degree: 'd', experienceYears: 3, photoDataUri: 'data:x' });
  });

  it('get forwards the caller context type, or undefined when anonymous', async () => {
    const { c, uc } = setup();
    uc.get.execute.mockResolvedValue({ id });
    await c.get(id, user);
    expect(uc.get.execute).toHaveBeenLastCalledWith(id, 'ADMIN');
    await c.get(id, undefined);
    expect(uc.get.execute).toHaveBeenLastCalledWith(id, undefined);
  });

  it('create returns the created doctor', async () => {
    const { c, uc } = setup();
    uc.create.execute.mockResolvedValue({ id });
    const dto = { a: 1 } as never;
    await expect(c.create(dto, user)).resolves.toEqual({ id });
    expect(uc.create.execute).toHaveBeenCalledWith(dto, user);
  });

  it('update returns void', async () => {
    const { c, uc } = setup();
    uc.update.execute.mockResolvedValue({ ignored: true });
    const dto = {} as never;
    await expect(c.update(id, dto, user)).resolves.toBeUndefined();
    expect(uc.update.execute).toHaveBeenCalledWith(id, dto, user);
  });

  it('verify / suspend return void', async () => {
    const { c, uc } = setup();
    await expect(c.verify(id, user)).resolves.toBeUndefined();
    expect(uc.verify.execute).toHaveBeenCalledWith(id, user);
    await expect(c.suspend(id, user)).resolves.toBeUndefined();
    expect(uc.suspend.execute).toHaveBeenCalledWith(id, user);
  });

  it('reject passes the reason code', async () => {
    const { c, uc } = setup();
    await expect(c.reject(id, { reasonCode: 'BAD' } as never, user)).resolves.toBeUndefined();
    expect(uc.reject.execute).toHaveBeenCalledWith(id, 'BAD', user);
  });

  it('createDoctorAffiliation delegates', async () => {
    const { c, uc } = setup();
    uc.affiliation.execute.mockResolvedValue({ id: 'a' });
    const dto = {} as never;
    await expect(c.createDoctorAffiliation(id, dto, user)).resolves.toEqual({ id: 'a' });
    expect(uc.affiliation.execute).toHaveBeenCalledWith(id, dto, user);
  });
});
