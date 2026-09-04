import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';

export type LabBranchSearchSort = 'distance' | 'name';

export interface LabBranchSearchParams {
  q?: string;
  lat?: number;
  lng?: number;
  radiusKm: number;
  homeCollectionCapable?: boolean;
  sort: LabBranchSearchSort;
  sortDir: 'asc' | 'desc';
  cursor?: { value: string; branchId: string };
  limit: number;
}

export interface LabBranchSearchRow {
  branch_id: string;
  laboratory_id: string;
  brand_name: string;
  legal_name: string;
  phone: string;
  iana_timezone: string;
  home_collection_capable: boolean;
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
 * Patient-facing branch search — the counterpart `PharmacyBranchSearchRepository`
 * has, `LabBranch` never had (File 12 Part 47/48 only added the `LAB_STAFF`
 * self-branch `GET /lab-branches/{id}`, no public directory read). Same
 * Postgres full-text + PostGIS approach, no rating/price columns exist on
 * `laboratories`/`lab_branches` so none are selected — unlike pharmacy there
 * is nothing to sort by besides distance/name.
 */
@Injectable()
export class LabBranchSearchRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async search(params: LabBranchSearchParams): Promise<LabBranchSearchRow[]> {
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
      Prisma.sql`l.status = 'VERIFIED'`,
      Prisma.sql`l.deleted_at IS NULL`,
      Prisma.sql`lb.status = 'VERIFIED'`,
    ];

    if (params.q) {
      const searchPattern = `%${params.q}%`;
      whereParts.push(
        Prisma.sql`(
          l.brand_name ILIKE ${searchPattern}
          OR l.legal_name ILIKE ${searchPattern}
          OR similarity(l.brand_name, ${params.q}) > 0.2
        )`,
      );
    }
    if (params.homeCollectionCapable !== undefined) {
      whereParts.push(Prisma.sql`lb.home_collection_capable = ${params.homeCollectionCapable}`);
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
        lb.id AS branch_id,
        l.id AS laboratory_id,
        l.brand_name,
        l.legal_name,
        lb.phone,
        lb.iana_timezone,
        lb.home_collection_capable,
        addr.line1 AS address_line1,
        addr.city,
        addr.region_code,
        addr.country_code,
        addr.geo_lat::float8 AS geo_lat,
        addr.geo_lng::float8 AS geo_lng,
        (${distanceSelect}) AS distance_km
      FROM lab_branches lb
      JOIN laboratories l ON l.id = lb.laboratory_id
      JOIN addresses addr ON addr.id = lb.address_id
      WHERE ${Prisma.join(whereParts, ' AND ')}
    `;

    const cursorParts: Prisma.Sql[] = [];
    if (params.cursor) {
      // `sort_value` is always carried as text in the opaque cursor (same
      // idiom pharmacy/doctor search use) but `distance_km` is numeric and
      // `brand_name` is text — cast to match whichever column is sorted on.
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

    return this.prisma.$queryRaw<LabBranchSearchRow[]>(query);
  }
}
