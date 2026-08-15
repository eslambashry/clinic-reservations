import { Inject, Injectable } from '@nestjs/common';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { DoctorSearchRepository, DoctorSearchRow, DoctorSearchSort } from '../infrastructure/doctor-search.repository';

export interface SearchDoctorsInput {
  specialty?: string;
  q?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  /** File 12 Part 32.11 — accepted, not yet honored (no `appointment_slots` until Phase 3). */
  date?: string;
  sort?: string;
  cursor?: string;
  limit?: number;
}

export interface SearchDoctorItem {
  doctorId: string;
  name: string;
  specialty: string;
  clinicBranchId: string;
  clinicName: string;
  distanceKm: number | null;
  rating: number;
  reviewCount: number;
  consultFee: string;
  currency: string;
  /** File 12 Part 32.12 — always null until Phase 3 (Scheduling) exists. */
  nextAvailableSlot: string | null;
}

export interface SearchDoctorsResult {
  items: SearchDoctorItem[];
  nextCursor: string | null;
}

const DEFAULT_RADIUS_KM = 15;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const SORT_WHITELIST: Record<string, { field: DoctorSearchSort; dir: 'asc' | 'desc' }> = {
  'distance:asc': { field: 'distance', dir: 'asc' },
  'rating:desc': { field: 'rating', dir: 'desc' },
  'price:asc': { field: 'price', dir: 'asc' },
};

interface DoctorSearchCursor {
  v: string;
  a: string;
}

@Injectable()
export class SearchDoctorsUseCase {
  constructor(@Inject(DoctorSearchRepository) private readonly repository: DoctorSearchRepository) {}

  async execute(input: SearchDoctorsInput): Promise<SearchDoctorsResult> {
    const hasLocation = input.lat !== undefined && input.lng !== undefined;
    const defaultSortKey = hasLocation ? 'distance:asc' : 'rating:desc';
    const sortKey = input.sort && SORT_WHITELIST[input.sort] ? input.sort : defaultSortKey;
    const { field: sort, dir: sortDir } = SORT_WHITELIST[sortKey];

    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = decodeCursor<DoctorSearchCursor>(input.cursor);

    const rows = await this.repository.search({
      specialtyCode: input.specialty,
      q: input.q,
      lat: input.lat,
      lng: input.lng,
      radiusKm: input.radiusKm ?? DEFAULT_RADIUS_KM,
      sort,
      sortDir,
      cursor: cursor ? { value: cursor.v, affiliationId: cursor.a } : undefined,
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map(toSearchItem),
      nextCursor: hasMore && last ? encodeCursor<DoctorSearchCursor>({ v: last.sort_value, a: last.affiliation_id }) : null,
    };
  }
}

function toSearchItem(row: DoctorSearchRow): SearchDoctorItem {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown';
  return {
    doctorId: row.doctor_id,
    name,
    specialty: row.specialty_name_en,
    clinicBranchId: row.clinic_branch_id,
    clinicName: row.clinic_name,
    distanceKm: row.distance_km === null ? null : Number(row.distance_km),
    rating: Number(row.rating_avg),
    reviewCount: row.rating_count,
    consultFee: row.consult_fee.toString(),
    currency: row.currency,
    nextAvailableSlot: null,
  };
}
