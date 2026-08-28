import { decodeCursor } from '../../../shared/core/pagination/cursor.util';
import { PharmacyBranchSearchRow } from '../infrastructure/pharmacy-branch-search.repository';
import { SearchPharmacyBranchesUseCase } from './search-pharmacy-branches.use-case';

function row(overrides: Partial<PharmacyBranchSearchRow> = {}): PharmacyBranchSearchRow {
  return {
    branch_id: 'branch-1',
    pharmacy_id: 'pharmacy-1',
    brand_name: 'Nile Pharmacy',
    legal_name: 'Nile Pharma LLC',
    phone: '+20221230001',
    iana_timezone: 'Africa/Cairo',
    delivery_capable: true,
    address_line1: '5 Zamalek Ave',
    city: 'Cairo',
    region_code: 'EG',
    country_code: 'EG',
    geo_lat: 30.044420,
    geo_lng: 31.235712,
    distance_km: null,
    sort_value: 'Nile Pharmacy',
    ...overrides,
  };
}

describe('SearchPharmacyBranchesUseCase', () => {
  function setup() {
    const repository = { search: jest.fn() };
    const useCase = new SearchPharmacyBranchesUseCase(repository as any);
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

    await useCase.execute({ sort: "rating:desc'; DROP TABLE pharmacies; --" });

    expect(repository.search).toHaveBeenCalledWith(expect.objectContaining({ sort: 'name', sortDir: 'asc' }));
  });

  it('passes deliveryCapable through to the repository', async () => {
    const { repository, useCase } = setup();
    repository.search.mockResolvedValue([row()]);

    await useCase.execute({ deliveryCapable: true });

    expect(repository.search).toHaveBeenCalledWith(expect.objectContaining({ deliveryCapable: true }));
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
    expect(decodeCursor(result.nextCursor!)).toEqual({ v: 'Nile Pharmacy', b: 'a' });
  });

  it('maps a row to the camelCase item shape, including nested address', async () => {
    const { repository, useCase } = setup();
    repository.search.mockResolvedValue([row({ distance_km: 1.2345 })]);

    const result = await useCase.execute({});

    expect(result.items[0]).toEqual({
      branchId: 'branch-1',
      pharmacyId: 'pharmacy-1',
      brandName: 'Nile Pharmacy',
      legalName: 'Nile Pharma LLC',
      phone: '+20221230001',
      ianaTimezone: 'Africa/Cairo',
      deliveryCapable: true,
      address: {
        line1: '5 Zamalek Ave',
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
