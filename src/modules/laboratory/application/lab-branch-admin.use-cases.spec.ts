import { CreateLabBranchUseCase } from './create-lab-branch.use-case';
import { UpdateLabBranchUseCase } from './update-lab-branch.use-case';

const actor = { sub: 'admin-1', roleMembershipId: 'rm-admin' } as any;

function base() {
  const tx = { tx: true } as any;
  const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
  const laboratories = { findById: jest.fn() };
  const branches = { create: jest.fn(), findByIdWithRelations: jest.fn(), update: jest.fn() };
  const addresses = { create: jest.fn(), update: jest.fn() };
  const audit = { record: jest.fn() };
  return { tx, prisma, laboratories, branches, addresses, audit };
}

describe('CreateLabBranchUseCase', () => {
  const input = {
    address: { line1: 'a' },
    phone: '+2010',
    ianaTimezone: 'Africa/Cairo',
    homeCollectionCapable: true,
  } as any;

  function build(b: ReturnType<typeof base>) {
    return new CreateLabBranchUseCase(
      b.prisma as any,
      b.laboratories as any,
      b.branches as any,
      b.addresses as any,
      b.audit as any,
    );
  }

  it('creates the address then the branch and audits', async () => {
    const b = base();
    b.laboratories.findById.mockResolvedValue({ id: 'lab-1', deleted_at: null });
    b.addresses.create.mockResolvedValue({ id: 'addr-1' });
    b.branches.create.mockResolvedValue({ id: 'br-1' });

    await expect(build(b).execute('lab-1', input, actor)).resolves.toEqual({ id: 'br-1' });

    expect(b.addresses.create).toHaveBeenCalledWith(b.tx, input.address);
    expect(b.branches.create).toHaveBeenCalledWith(b.tx, {
      laboratoryId: 'lab-1',
      addressId: 'addr-1',
      phone: '+2010',
      ianaTimezone: 'Africa/Cairo',
      homeCollectionCapable: true,
    });
    expect(b.audit.record).toHaveBeenCalledWith(
      b.tx,
      expect.objectContaining({ action: 'laboratory.lab_branch.create', resourceId: 'br-1' }),
    );
  });

  it.each([[null], [{ deleted_at: new Date() }]])('404s when laboratory is %p', async (row) => {
    const b = base();
    b.laboratories.findById.mockResolvedValue(row);
    await expect(build(b).execute('lab-1', input, actor)).rejects.toMatchObject({ httpStatus: 404 });
    expect(b.addresses.create).not.toHaveBeenCalled();
  });
});

describe('UpdateLabBranchUseCase', () => {
  function build(b: ReturnType<typeof base>) {
    return new UpdateLabBranchUseCase(b.prisma as any, b.branches as any, b.addresses as any, b.audit as any);
  }

  it('updates the branch and its address when an address patch is given', async () => {
    const b = base();
    b.branches.findByIdWithRelations.mockResolvedValue({ id: 'br-1', version: 4, address_id: 'addr-1', address: { version: 2 } });
    const input = { phone: '+2011', address: { city: 'Giza' } } as any;

    await build(b).execute('br-1', input, actor);

    expect(b.branches.update).toHaveBeenCalledWith(b.tx, 'br-1', 4, input);
    expect(b.addresses.update).toHaveBeenCalledWith(b.tx, 'addr-1', 2, { city: 'Giza' });
    expect(b.audit.record).toHaveBeenCalledWith(b.tx, expect.objectContaining({ action: 'laboratory.lab_branch.update' }));
  });

  it('skips the address update when no address is provided', async () => {
    const b = base();
    b.branches.findByIdWithRelations.mockResolvedValue({ id: 'br-1', version: 4, address_id: 'addr-1', address: { version: 2 } });

    await build(b).execute('br-1', { phone: '+2011' } as any, actor);

    expect(b.addresses.update).not.toHaveBeenCalled();
  });

  it('404s a missing branch', async () => {
    const b = base();
    b.branches.findByIdWithRelations.mockResolvedValue(null);
    await expect(build(b).execute('br-1', {} as any, actor)).rejects.toMatchObject({ httpStatus: 404 });
    expect(b.branches.update).not.toHaveBeenCalled();
  });
});
