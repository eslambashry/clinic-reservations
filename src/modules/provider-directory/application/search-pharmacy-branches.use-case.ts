import { Inject, Injectable } from '@nestjs/common';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import {
  PharmacyBranchSearchRepository,
  PharmacyBranchSearchRow,
  PharmacyBranchSearchSort,
} from '../infrastructure/pharmacy-branch-search.repository';

export interface SearchPharmacyBranchesInput {
  q?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  deliveryCapable?: boolean;
  sort?: string;
  cursor?: string;
  limit?: number;
}

export interface SearchPharmacyBranchItem {
  branchId: string;
  pharmacyId: string;
  brandName: string;
  legalName: string;
  phone: string;
  ianaTimezone: string;
  deliveryCapable: boolean;
  address: {
    line1: string;
    city: string;
    regionCode: string;
    countryCode: string;
    geoLat: number | null;
    geoLng: number | null;
  };
  distanceKm: number | null;
}

export interface SearchPharmacyBranchesResult {
  items: SearchPharmacyBranchItem[];
  nextCursor: string | null;
}

const DEFAULT_RADIUS_KM = 15;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const SORT_WHITELIST: Record<string, { field: PharmacyBranchSearchSort; dir: 'asc' | 'desc' }> = {
  'distance:asc': { field: 'distance', dir: 'asc' },
  'name:asc': { field: 'name', dir: 'asc' },
};

interface PharmacyBranchSearchCursor {
  v: string;
  b: string;
}

/**
 * File 12 Part 37 — the branch is the unit a patient browses/picks (the
 * same chain can have more than one branch; only a branch has an
 * address/phone to actually fulfil an order against), so this searches
 * `pharmacy_branches` directly rather than returning `Pharmacy` rows with
 * nested branches the way `GetPharmacyUseCase`'s `PharmacyWithBranches`
 * does for the single-record detail endpoint.
 */
@Injectable()
export class SearchPharmacyBranchesUseCase {
  constructor(@Inject(PharmacyBranchSearchRepository) private readonly repository: PharmacyBranchSearchRepository) {}

  async execute(input: SearchPharmacyBranchesInput): Promise<SearchPharmacyBranchesResult> {
    const hasLocation = input.lat !== undefined && input.lng !== undefined;
    const defaultSortKey = hasLocation ? 'distance:asc' : 'name:asc';
    const sortKey = input.sort && SORT_WHITELIST[input.sort] ? input.sort : defaultSortKey;
    const { field: sort, dir: sortDir } = SORT_WHITELIST[sortKey];

    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = decodeCursor<PharmacyBranchSearchCursor>(input.cursor);

    const rows = await this.repository.search({
      q: input.q,
      lat: input.lat,
      lng: input.lng,
      radiusKm: input.radiusKm ?? DEFAULT_RADIUS_KM,
      deliveryCapable: input.deliveryCapable,
      sort,
      sortDir,
      cursor: cursor ? { value: cursor.v, branchId: cursor.b } : undefined,
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map(toSearchItem),
      nextCursor: hasMore && last ? encodeCursor<PharmacyBranchSearchCursor>({ v: last.sort_value, b: last.branch_id }) : null,
    };
  }
}

function toSearchItem(row: PharmacyBranchSearchRow): SearchPharmacyBranchItem {
  return {
    branchId: row.branch_id,
    pharmacyId: row.pharmacy_id,
    brandName: row.brand_name,
    legalName: row.legal_name,
    phone: row.phone,
    ianaTimezone: row.iana_timezone,
    deliveryCapable: row.delivery_capable,
    address: {
      line1: row.address_line1,
      city: row.city,
      regionCode: row.region_code,
      countryCode: row.country_code,
      geoLat: row.geo_lat,
      geoLng: row.geo_lng,
    },
    distanceKm: row.distance_km === null ? null : Number(row.distance_km),
  };
}
