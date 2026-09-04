import { Inject, Injectable } from '@nestjs/common';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { LabBranchSearchRepository, LabBranchSearchRow, LabBranchSearchSort } from '../infrastructure/lab-branch-search.repository';

export interface SearchLabBranchesInput {
  q?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  homeCollectionCapable?: boolean;
  sort?: string;
  cursor?: string;
  limit?: number;
}

export interface SearchLabBranchItem {
  branchId: string;
  laboratoryId: string;
  brandName: string;
  legalName: string;
  phone: string;
  ianaTimezone: string;
  homeCollectionCapable: boolean;
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

export interface SearchLabBranchesResult {
  items: SearchLabBranchItem[];
  nextCursor: string | null;
}

const DEFAULT_RADIUS_KM = 15;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const SORT_WHITELIST: Record<string, { field: LabBranchSearchSort; dir: 'asc' | 'desc' }> = {
  'distance:asc': { field: 'distance', dir: 'asc' },
  'name:asc': { field: 'name', dir: 'asc' },
};

interface LabBranchSearchCursor {
  v: string;
  b: string;
}

/**
 * `GET /lab-branches/search` — mirrors `SearchPharmacyBranchesUseCase`
 * exactly. The patient-facing counterpart the Laboratory un-postpone (File
 * 12 Part 47/48) never added — that pass only built the `LAB_STAFF`
 * self-branch `GET /lab-branches/{id}` for the real-auth bridge, leaving
 * `med-super`'s lab-booking flow with nothing to browse against.
 */
@Injectable()
export class SearchLabBranchesUseCase {
  constructor(@Inject(LabBranchSearchRepository) private readonly repository: LabBranchSearchRepository) {}

  async execute(input: SearchLabBranchesInput): Promise<SearchLabBranchesResult> {
    const hasLocation = input.lat !== undefined && input.lng !== undefined;
    const defaultSortKey = hasLocation ? 'distance:asc' : 'name:asc';
    const sortKey = input.sort && SORT_WHITELIST[input.sort] ? input.sort : defaultSortKey;
    const { field: sort, dir: sortDir } = SORT_WHITELIST[sortKey];

    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = decodeCursor<LabBranchSearchCursor>(input.cursor);

    const rows = await this.repository.search({
      q: input.q,
      lat: input.lat,
      lng: input.lng,
      radiusKm: input.radiusKm ?? DEFAULT_RADIUS_KM,
      homeCollectionCapable: input.homeCollectionCapable,
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
      nextCursor: hasMore && last ? encodeCursor<LabBranchSearchCursor>({ v: last.sort_value, b: last.branch_id }) : null,
    };
  }
}

function toSearchItem(row: LabBranchSearchRow): SearchLabBranchItem {
  return {
    branchId: row.branch_id,
    laboratoryId: row.laboratory_id,
    brandName: row.brand_name,
    legalName: row.legal_name,
    phone: row.phone,
    ianaTimezone: row.iana_timezone,
    homeCollectionCapable: row.home_collection_capable,
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
