import { LabAuditController } from './lab-audit.controller';
import { LabBranchesController } from './lab-branches.controller';
import { LabStaffController } from './lab-staff.controller';
import { LaboratoriesController } from './laboratories.controller';

const user = { sub: 'u1', roleMembershipId: 'rm1' } as any;
const ID = '11111111-1111-1111-1111-111111111111';
const ID2 = '22222222-2222-2222-2222-222222222222';
const exec = (value: unknown = { ok: true }) => ({ execute: jest.fn().mockResolvedValue(value) });

describe('LabAuditController', () => {
  it('delegates to the use case with query and user', async () => {
    const uc = exec({ items: [] });
    const query = { limit: 10 } as any;
    await expect(new LabAuditController(uc as any).list(query, user)).resolves.toEqual({ items: [] });
    expect(uc.execute).toHaveBeenCalledWith(query, user);
  });
});

describe('LabBranchesController', () => {
  function setup() {
    const get = exec();
    const search = exec({ items: [] });
    const update = exec(undefined);
    return { get, search, update, controller: new LabBranchesController(get as any, search as any, update as any) };
  }

  it('search delegates the query', async () => {
    const s = setup();
    const query = { q: 'nile' } as any;
    await expect(s.controller.search(query)).resolves.toEqual({ items: [] });
    expect(s.search.execute).toHaveBeenCalledWith(query);
  });

  it('get delegates branch id and user', async () => {
    const s = setup();
    await s.controller.get(ID, user);
    expect(s.get.execute).toHaveBeenCalledWith(ID, user);
  });

  it('update delegates and returns void', async () => {
    const s = setup();
    const dto = { phone: 'p' } as any;
    await expect(s.controller.update(ID, dto, user)).resolves.toBeUndefined();
    expect(s.update.execute).toHaveBeenCalledWith(ID, dto, user);
  });
});

describe('LabStaffController', () => {
  function setup() {
    const get = exec({ id: 's' });
    const create = exec({ id: 'new' });
    const update = exec({ id: 'upd' });
    const del = exec(undefined);
    return { get, create, update, del, controller: new LabStaffController(get as any, create as any, update as any, del as any) };
  }

  it('get', async () => {
    const s = setup();
    await expect(s.controller.get(ID)).resolves.toEqual({ id: 's' });
    expect(s.get.execute).toHaveBeenCalledWith(ID);
  });

  it('create', async () => {
    const s = setup();
    const dto = { phone: 'p' } as any;
    await expect(s.controller.create(ID, dto, user)).resolves.toEqual({ id: 'new' });
    expect(s.create.execute).toHaveBeenCalledWith(ID, dto, user);
  });

  it('update', async () => {
    const s = setup();
    const dto = { display_name: 'n' } as any;
    await expect(s.controller.update(ID, ID2, dto, user)).resolves.toEqual({ id: 'upd' });
    expect(s.update.execute).toHaveBeenCalledWith(ID, ID2, dto, user);
  });

  it('remove', async () => {
    const s = setup();
    await expect(s.controller.remove(ID, ID2, user)).resolves.toBeUndefined();
    expect(s.del.execute).toHaveBeenCalledWith(ID, ID2, user);
  });
});

describe('LaboratoriesController', () => {
  function setup() {
    const uc = {
      list: exec({ items: [] }),
      create: exec({ id: 'lab' }),
      get: exec({ id: 'lab' }),
      update: exec(undefined),
      verify: exec(undefined),
      suspend: exec(undefined),
      branch: exec({ id: 'br' }),
    };
    const controller = new LaboratoriesController(
      uc.list as any,
      uc.create as any,
      uc.get as any,
      uc.update as any,
      uc.verify as any,
      uc.suspend as any,
      uc.branch as any,
    );
    return { uc, controller };
  }

  it('list', async () => {
    const { uc, controller } = setup();
    const query = { page: 1 } as any;
    await expect(controller.list(query)).resolves.toEqual({ items: [] });
    expect(uc.list.execute).toHaveBeenCalledWith(query);
  });

  it('create', async () => {
    const { uc, controller } = setup();
    const dto = { legalName: 'l' } as any;
    await expect(controller.create(dto, user)).resolves.toEqual({ id: 'lab' });
    expect(uc.create.execute).toHaveBeenCalledWith(dto, user);
  });

  it('get', async () => {
    const { uc, controller } = setup();
    await controller.get(ID);
    expect(uc.get.execute).toHaveBeenCalledWith(ID);
  });

  it('update', async () => {
    const { uc, controller } = setup();
    const dto = { brandName: 'b' } as any;
    await expect(controller.update(ID, dto, user)).resolves.toBeUndefined();
    expect(uc.update.execute).toHaveBeenCalledWith(ID, dto, user);
  });

  it('verify / suspend', async () => {
    const { uc, controller } = setup();
    await controller.verify(ID, user);
    expect(uc.verify.execute).toHaveBeenCalledWith(ID, user);
    await controller.suspend(ID, user);
    expect(uc.suspend.execute).toHaveBeenCalledWith(ID, user);
  });

  it('createLabBranch', async () => {
    const { uc, controller } = setup();
    const dto = { phone: 'p' } as any;
    await expect(controller.createLabBranch(ID, dto, user)).resolves.toEqual({ id: 'br' });
    expect(uc.branch.execute).toHaveBeenCalledWith(ID, dto, user);
  });
});
