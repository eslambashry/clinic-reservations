import { ProviderRegistrationController } from './provider-registration.controller';

const user = { sub: 'u1' } as never;

describe('ProviderRegistrationController', () => {
  const reg = { execute: jest.fn() };
  const spec = { execute: jest.fn() };
  const status = { execute: jest.fn() };
  const c = new ProviderRegistrationController(reg as never, spec as never, status as never);

  it('lookups maps specialties and returns empty cities', async () => {
    spec.execute.mockResolvedValue([{ code: 'c1', name_ar: 'AR' }]);
    await expect(c.lookups()).resolves.toEqual({ specialties: [{ id: 'c1', label: 'AR' }], cities: [] });
  });

  it('submit delegates', async () => {
    reg.execute.mockResolvedValue({ ok: 1 });
    const dto = {} as never;
    await expect(c.submit(dto, user)).resolves.toEqual({ ok: 1 });
    expect(reg.execute).toHaveBeenCalledWith(dto, user);
  });

  it('status delegates', async () => {
    status.execute.mockResolvedValue({ status: 'PENDING' });
    await expect(c.status(user)).resolves.toEqual({ status: 'PENDING' });
    expect(status.execute).toHaveBeenCalledWith(user);
  });
});
