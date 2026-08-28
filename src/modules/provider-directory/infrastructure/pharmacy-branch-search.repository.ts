import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';

export type PharmacyBranchSearchSort = 'distance' | 'name';

export interface PharmacyBranchSearchParams {
  q?: string;
  lat?: number;
  lng?: number;
  radiusKm: number;
  deliveryCapable?: boolean;
  sort: PharmacyBranchSearchSort;
  sortDir: 'asc' | 'desc';
  cursor?: { value: string; branchId: string };
  limit: number;
}

export interface PharmacyBranchSearchRow {
  branch_id: string;
  pharmacy_id: string;
  brand_name: string;
  legal_name: string;
  phone: string;
  iana_timezone: string;
  delivery_capable: boolean;
  address_line1: string;
  city: string;
  region_code: string;
  country_code: string;
  geo_lat: number | null;
  geo_lng: number | null;
  distance_km: number | null;
  sort_value: string;
}

/**
 * File 12 Part 37: same Postgres full-text + PostGIS approach as
 * `DoctorSearchRepository` (File 11 Part 22/File 12 Part 32), and the same
 * reason for dropping to raw `$queryRaw` — Prisma's query builder has no
 * PostGIS/pg_trgm support. Visibility is a 2-hop chain (`pharmacy_branches
 * → pharmacies`), simpler than doctor search's 4-hop
 * affiliation/branch/clinic chain — there is no junction table to join
 * through, so the visibility conditions below are the direct SQL
 * equivalent of `isProviderEntityVisible`/`isBranchVisible`
 * (`provider-visibility.rules.ts`), not a call into that helper (same
 * reason doctor search doesn't call it either: search hardcodes visibility
 * into the CTE `WHERE`, the domain rule functions are only used by
 * single-record detail use-cases with an Admin-bypass branch).
 */
@Injectable()
export class PharmacyBranchSearchRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async search(params: PharmacyBranchSearchParams): Promise<PharmacyBranchSearchRow[]> {
    const hasLocation = params.lat !== undefined && params.lng !== undefined;

    const sortExpr = params.sort === 'distance' ? Prisma.sql`distance_km` : Prisma.sql`brand_name`;
    const sortDirSql = params.sortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const cursorCompare = params.sortDir === 'asc' ? Prisma.sql`>` : Prisma.sql`<`;

    const distanceSelect = hasLocation
      ? Prisma.sql`ST_Distance(
          geography(ST_MakePoint(addr.geo_lng::float8, addr.geo_lat::float8)),
          geography(ST_MakePoint(${params.lng}::float8, ${params.lat}::float8))
        ) / 1000.0`
      : Prisma.sql`NULL`;

    const whereParts: Prisma.Sql[] = [
      Prisma.sql`p.status = 'VERIFIED'`,
      Prisma.sql`p.deleted_at IS NULL`,
      Prisma.sql`pb.status = 'VERIFIED'`,
    ];

    if (params.q) {
      whereParts.push(Prisma.sql`similarity(p.brand_name, ${params.q}) > 0.2`);
    }
    if (params.deliveryCapable !== undefined) {
      whereParts.push(Prisma.sql`pb.delivery_capable = ${params.deliveryCapable}`);
    }
    if (hasLocation) {
      whereParts.push(Prisma.sql`ST_DWithin(
        geography(ST_MakePoint(addr.geo_lng::float8, addr.geo_lat::float8)),
        geography(ST_MakePoint(${params.lng}::float8, ${params.lat}::float8)),
        ${params.radiusKm * 1000}
      )`);
    }

    const cteQuery = Prisma.sql`
      SELECT
        pb.id AS branch_id,
        p.id AS pharmacy_id,
        p.brand_name,
        p.legal_name,
        pb.phone,
        pb.iana_timezone,
        pb.delivery_capable,
        addr.line1 AS address_line1,
        addr.city,
        addr.region_code,
        addr.country_code,
        addr.geo_lat::float8 AS geo_lat,
        addr.geo_lng::float8 AS geo_lng,
        (${distanceSelect}) AS distance_km
      FROM pharmacy_branches pb
      JOIN pharmacies p ON p.id = pb.pharmacy_id
      JOIN addresses addr ON addr.id = pb.address_id
      WHERE ${Prisma.join(whereParts, ' AND ')}
    `;

    const cursorParts: Prisma.Sql[] = [];
    if (params.cursor) {
      // `sort_value` is always carried as text in the opaque cursor (File 12
      // Part 32.16) but `distance_km` is numeric and `brand_name` is text —
      // cast to match whichever column is actually being sorted on, same
      // idiom as doctor search's numeric-only cursor comparison.
      const cursorValue = params.sort === 'distance' ? Prisma.sql`(${params.cursor.value})::numeric` : Prisma.sql`${params.cursor.value}`;
      const cursorBranchId = Prisma.sql`(${params.cursor.branchId})::uuid`;
      cursorParts.push(Prisma.sql`(
        ${sortExpr} ${cursorCompare} ${cursorValue}
        OR (${sortExpr} = ${cursorValue} AND branch_id > ${cursorBranchId})
      )`);
    }

    const outerWhere = cursorParts.length > 0 ? Prisma.sql`WHERE ${Prisma.join(cursorParts, ' AND ')}` : Prisma.empty;

    const query = Prisma.sql`
      WITH search_results AS (${cteQuery})
      SELECT *, (${sortExpr})::text AS sort_value
      FROM search_results
      ${outerWhere}
      ORDER BY ${sortExpr} ${sortDirSql} NULLS LAST, branch_id ASC
      LIMIT ${params.limit}
    `;

    return this.prisma.$queryRaw<PharmacyBranchSearchRow[]>(query);
  }
}
