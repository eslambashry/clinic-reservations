import { ListDoctorsUseCase } from './list-doctors.use-case';

describe('ListDoctorsUseCase', () => {
  function setup() {
    const prisma = {} as any;
    const doctors = { list: jest.fn() };
    const useCase = new ListDoctorsUseCase(prisma, doctors as any);
    return { prisma, doctors, useCase };
  }

  function row(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'doctor-1',
      user: { first_name: 'Sara', last_name: 'Ali', phone: '+201000000009' },
      specialty_code: 'CARDIOLOGY',
      specialty: { name_en: 'Cardiology' },
      license_number: 'LIC-1',
      region_code: 'CAI',
      status: 'PENDING',
      photo_url: null,
      created_at: new Date('2026-09-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  it('projects each row into the admin-queue shape', async () => {
    const { doctors, useCase } = setup();
    doctors.list.mockResolvedValue([row()]);

    const result = await useCase.execute({ status: 'PENDING' as any });

    expect(result.items).toEqual([
      {
        id: 'doctor-1',
        name: 'Sara Ali',
        phone: '+201000000009',
        specialtyCode: 'CARDIOLOGY',
        specialty: 'Cardiology',
        licenseNumber: 'LIC-1',
        regionCode: 'CAI',
        status: 'PENDING',
        photoUrl: null,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
    expect(result.nextCursor).toBeNull();
    expect(doctors.list).toHaveBeenCalledWith(expect.anything(), {
      status: 'PENDING',
      cursor: undefined,
      limit: 21,
    });
  });

  it('signals more pages via nextCursor when the repository returns one extra row', async () => {
    const { doctors, useCase } = setup();
    doctors.list.mockResolvedValue([row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })]);

    const result = await useCase.execute({ limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();
  });

  it('falls back to no status filter and the default limit when none is given', async () => {
    const { doctors, useCase } = setup();
    doctors.list.mockResolvedValue([]);

    await useCase.execute({});

    expect(doctors.list).toHaveBeenCalledWith(expect.anything(), {
      status: undefined,
      cursor: undefined,
      limit: 21,
    });
  });
});
