import { Prisma } from '@prisma/client';
import { decodeCursor } from '../../../shared/core/pagination/cursor.util';
import { DoctorSearchRow } from '../infrastructure/doctor-search.repository';
import { SearchDoctorsUseCase } from './search-doctors.use-case';

function row(overrides: Partial<DoctorSearchRow> = {}): DoctorSearchRow {
  return {
    affiliation_id: 'aff-1',
    doctor_id: 'doc-1',
    first_name: 'Mona',
    last_name: 'Fahmy',
    photo_url: null,
    specialty_code: 'GENERAL_PRACTICE',
    specialty_name_en: 'General Practice',
    clinic_branch_id: 'branch-1',
    clinic_name: 'Nile Clinic',
    consult_fee: new Prisma.Decimal('350.00'),
    currency: 'EGP',
    rating_avg: new Prisma.Decimal('4.5'),
    rating_count: 12,
    distance_km: null,
    sort_value: '4.5',
    ...overrides,
  };
}

describe('SearchDoctorsUseCase', () => {
  function setup() {
    const repository = { search: jest.fn() };
    const useCase = new SearchDoctorsUseCase(repository as any);
    return { repository, useCase };
  }

  it('defaults to rating:desc when no location and no sort are given', async () => {
    const { repository, useCase } = setup();
    repository.search.mockResolvedValue([row()]);

    await useCase.execute({});

    expect(repository.search).toHaveBeenCalledWith(expect.objectContaining({ sort: 'rating', sortDir: 'desc' }));
  });

  it('defaults to distance:asc when lat/lng are given', async () => {
    const { repository, useCase } = setup();
    repository.search.mockResolvedValue([row()]);

    await useCase.execute({ lat: 30.04, lng: 31.23 });

    expect(repository.search).toHaveBeenCalledWith(expect.objectContaining({ sort: 'distance', sortDir: 'asc' }));
  });

  it('ignores an unrecognized sort value and falls back to the default (whitelist, File 10 §2.2)', async () => {
    const { repository, useCase } = setup();
    repository.search.mockResolvedValue([row()]);

    await useCase.execute({ sort: "price:asc'; DROP TABLE doctors; --" });

    expect(repository.search).toHaveBeenCalledWith(expect.objectContaining({ sort: 'rating', sortDir: 'desc' }));
  });

  it('caps limit at 50 and requests limit+1 rows to detect a next page', async () => {
    const { repository, useCase } = setup();
    repository.search.mockResolvedValue([row()]);

    await useCase.execute({ limit: 999 });

    expect(repository.search).toHaveBeenCalledWith(expect.objectContaining({ limit: 51 }));
  });

  it('returns nextCursor null when fewer rows than the limit come back', async () => {
    const { repository, useCase } = setup();
    repository.search.mockResolvedValue([row()]);

    const result = await useCase.execute({ limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it('returns an encoded nextCursor and trims to the page size when there is a next page', async () => {
    const { repository, useCase } = setup();
    repository.search.mockResolvedValue([row({ affiliation_id: 'a' }), row({ affiliation_id: 'b' })]);

    const result = await useCase.execute({ limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).not.toBeNull();
    expect(decodeCursor(result.nextCursor!)).toEqual({ v: '4.5', a: 'a' });
  });

  it('always returns nextAvailableSlot: null (Part 32.12 — Phase 3 dependency)', async () => {
    const { repository, useCase } = setup();
    repository.search.mockResolvedValue([row()]);

    const result = await useCase.execute({});

    expect(result.items[0].nextAvailableSlot).toBeNull();
  });
});
