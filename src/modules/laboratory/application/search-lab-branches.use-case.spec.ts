import { decodeCursor } from '../../../shared/core/pagination/cursor.util';
import { LabBranchSearchRow } from '../infrastructure/lab-branch-search.repository';
import { SearchLabBranchesUseCase } from './search-lab-branches.use-case';

function row(overrides: Partial<LabBranchSearchRow> = {}): LabBranchSearchRow {
  return {
    branch_id: 'branch-1',
    laboratory_id: 'lab-1',
    brand_name: 'Nile Labs',
    legal_name: 'Nile Diagnostics LLC',
    phone: '+20221230004',
    iana_timezone: 'Africa/Cairo',
    home_collection_capable: true,
    address_line1: '9 Qasr El Nil St',
    city: 'Cairo',
    region_code: 'EG',
    country_code: 'EG',
    geo_lat: 30.044420,
    geo_lng: 31.235712,
    distance_km: null,
    sort_value: 'Nile Labs',
    ...overrides,
  };
}

describe('SearchLabBranchesUseCase', () => {
  function setup() {
    const repository = { search: jest.fn() };
    const useCase = new SearchLabBranchesUseCase(repository as any);
    return { repository, useCase };
  }

  it('defaults to name:asc when no location and no sort are given', async () => {
    const { repository, useCase } = setup();
    repository.search.mockResolvedValue([row()]);

    await useCase.execute({});

    expect(repository.search).toHaveBeenCalledWith(expect.objectContaining({ sort: 'name', sortDir: 'asc' }));
  });

  it('defaults to distance:asc when lat/lng are given', async () => {
    const { repository, useCase } = setup();
    repository.search.mockResolvedValue([row()]);

    await useCase.execute({ lat: 30.04, lng: 31.23 });

    expect(repository.search).toHaveBeenCalledWith(expect.objectContaining({ sort: 'distance', sortDir: 'asc' }));
  });

  it('ignores an unrecognized sort value and falls back to the default', async () => {
    const { repository, useCase } = setup();
    repository.search.mockResolvedValue([row()]);

    await useCase.execute({ sort: "rating:desc'; DROP TABLE laboratories; --" });

    expect(repository.search).toHaveBeenCalledWith(expect.objectContaining({ sort: 'name', sortDir: 'asc' }));
  });

  it('passes homeCollectionCapable through to the repository', async () => {
    const { repository, useCase } = setup();
    repository.search.mockResolvedValue([row()]);

    await useCase.execute({ homeCollectionCapable: true });

    expect(repository.search).toHaveBeenCalledWith(expect.objectContaining({ homeCollectionCapable: true }));
  });

  it('passes a one-character brand-name query to the repository', async () => {
    const { repository, useCase } = setup();
    repository.search.mockResolvedValue([row()]);

    await useCase.execute({ q: 'N' });

    expect(repository.search).toHaveBeenCalledWith(expect.objectContaining({ q: 'N' }));
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
    repository.search.mockResolvedValue([row({ branch_id: 'a' }), row({ branch_id: 'b' })]);

    const result = await useCase.execute({ limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).not.toBeNull();
    expect(decodeCursor(result.nextCursor!)).toEqual({ v: 'Nile Labs', b: 'a' });
  });

  it('maps a row to the camelCase item shape, including nested address', async () => {
    const { repository, useCase } = setup();
    repository.search.mockResolvedValue([row({ distance_km: 1.2345 })]);

    const result = await useCase.execute({});

    expect(result.items[0]).toEqual({
      branchId: 'branch-1',
      laboratoryId: 'lab-1',
      brandName: 'Nile Labs',
      legalName: 'Nile Diagnostics LLC',
      phone: '+20221230004',
      ianaTimezone: 'Africa/Cairo',
      homeCollectionCapable: true,
      address: {
        line1: '9 Qasr El Nil St',
        city: 'Cairo',
        regionCode: 'EG',
        countryCode: 'EG',
        geoLat: 30.044420,
        geoLng: 31.235712,
      },
      distanceKm: 1.2345,
    });
  });
});
