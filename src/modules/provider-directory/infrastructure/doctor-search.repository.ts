import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';

export type DoctorSearchSort = 'distance' | 'rating' | 'price';

export interface DoctorSearchFilterParams {
  specialtyCode?: string;
  q?: string;
  lat?: number;
  lng?: number;
  radiusKm: number;
}

export interface DoctorSearchParams extends DoctorSearchFilterParams {
  sort: DoctorSearchSort;
  sortDir: 'asc' | 'desc';
  cursor?: { value: string; affiliationId: string };
  limit: number;
}

export interface DoctorSearchRow {
  affiliation_id: string;
  doctor_id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  specialty_code: string;
  specialty_name_en: string;
  clinic_branch_id: string;
  clinic_name: string;
  consult_fee: Prisma.Decimal;
  currency: string;
  rating_avg: Prisma.Decimal;
  rating_count: number;
  distance_km: number | null;
  sort_value: string;
}

/**
 * File 11 Part 22 / File 12 Part 32: Postgres full-text + PostGIS search, no
 * Elasticsearch/etc. justified yet at MVP catalog size. Raw, fully
 * parameterized `$queryRaw` (File 11 Part 23: "no raw string concatenation
 * into SQL, anywhere") — Prisma's query builder has no PostGIS/pg_trgm
 * support, so this is the one place in the module that drops to SQL.
 *
 * A CTE materializes the joined/filtered/computed columns (including the
 * on-the-fly `ST_Distance` geography cast — no stored geometry column
 * needed at "thousands, not millions" scale per Part 22) so the outer query
 * can filter/order by the computed alias, which plain SQL doesn't allow
 * directly in a WHERE clause.
 */
@Injectable()
export class DoctorSearchRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private buildWhereParts(params: DoctorSearchFilterParams): Prisma.Sql[] {
    const hasLocation = params.lat !== undefined && params.lng !== undefined;

    const whereParts: Prisma.Sql[] = [
      Prisma.sql`d.status = 'VERIFIED'`,
      Prisma.sql`d.deleted_at IS NULL`,
      Prisma.sql`a.status = 'ACTIVE'`,
      Prisma.sql`cb.status = 'VERIFIED'`,
      Prisma.sql`c.status = 'VERIFIED'`,
      Prisma.sql`c.deleted_at IS NULL`,
    ];

    if (params.specialtyCode) {
      whereParts.push(Prisma.sql`d.specialty_code = ${params.specialtyCode}`);
    }
    if (params.q) {
      whereParts.push(Prisma.sql`(
        similarity(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''), ${params.q}) > 0.2
        OR similarity(s.name_en, ${params.q}) > 0.2
        OR similarity(s.name_ar, ${params.q}) > 0.2
      )`);
    }
    if (hasLocation) {
      whereParts.push(Prisma.sql`ST_DWithin(
        geography(ST_MakePoint(addr.geo_lng::float8, addr.geo_lat::float8)),
        geography(ST_MakePoint(${params.lng}::float8, ${params.lat}::float8)),
        ${params.radiusKm * 1000}
      )`);
    }

    return whereParts;
  }

  async count(params: DoctorSearchFilterParams): Promise<number> {
    const whereParts = this.buildWhereParts(params);

    const query = Prisma.sql`
      SELECT COUNT(DISTINCT d.id)::int AS count
      FROM doctor_clinic_affiliations a
      JOIN doctors d ON d.id = a.doctor_id
      JOIN users u ON u.id = d.user_id
      JOIN specialties s ON s.code = d.specialty_code
      JOIN clinic_branches cb ON cb.id = a.clinic_branch_id
      JOIN clinics c ON c.id = cb.clinic_id
      JOIN addresses addr ON addr.id = cb.address_id
      WHERE ${Prisma.join(whereParts, ' AND ')}
    `;
    const rows = await this.prisma.$queryRaw<{ count: number }[]>(query);
    return rows[0]?.count ?? 0;
  }

  async search(params: DoctorSearchParams): Promise<DoctorSearchRow[]> {
    const hasLocation = params.lat !== undefined && params.lng !== undefined;

    const sortExpr =
      params.sort === 'distance' ? Prisma.sql`distance_km` : params.sort === 'price' ? Prisma.sql`consult_fee` : Prisma.sql`rating_avg`;
    const sortDirSql = params.sortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const cursorCompare = params.sortDir === 'asc' ? Prisma.sql`>` : Prisma.sql`<`;

    const distanceSelect = hasLocation
      ? Prisma.sql`ST_Distance(
          geography(ST_MakePoint(addr.geo_lng::float8, addr.geo_lat::float8)),
          geography(ST_MakePoint(${params.lng}::float8, ${params.lat}::float8))
        ) / 1000.0`
      : Prisma.sql`NULL`;

    const whereParts = this.buildWhereParts(params);

    // A doctor can be affiliated with several clinic branches; DISTINCT ON
    // collapses those to one row per doctor (the best-ranked branch by the
    // requested sort — nearest/top-rated/cheapest), so search results show
    // each doctor once instead of once per branch.
    const cteQuery = Prisma.sql`
      SELECT DISTINCT ON (d.id)
        a.id AS affiliation_id,
        d.id AS doctor_id,
        u.first_name,
        u.last_name,
        d.photo_url,
        d.specialty_code,
        s.name_en AS specialty_name_en,
        cb.id AS clinic_branch_id,
        c.brand_name AS clinic_name,
        a.consult_fee,
        a.currency,
        d.rating_avg,
        d.rating_count,
        (${distanceSelect}) AS distance_km
      FROM doctor_clinic_affiliations a
      JOIN doctors d ON d.id = a.doctor_id
      JOIN users u ON u.id = d.user_id
      JOIN specialties s ON s.code = d.specialty_code
      JOIN clinic_branches cb ON cb.id = a.clinic_branch_id
      JOIN clinics c ON c.id = cb.clinic_id
      JOIN addresses addr ON addr.id = cb.address_id
      WHERE ${Prisma.join(whereParts, ' AND ')}
      ORDER BY d.id, ${sortExpr} ${sortDirSql} NULLS LAST
    `;

    const cursorParts: Prisma.Sql[] = [];
    if (params.cursor) {
      // `sort_value`/the cursor's `v` are always carried as text (opaque
      // cursor, File 12 Part 32.16) but every sort column here is numeric
      // (distance_km/consult_fee/rating_avg) — compare numerically, not as
      // text, or ordering breaks ('10' < '9' lexicographically) and the
      // untyped comparison fails outright (`numeric < text`, no operator).
      const cursorValue = Prisma.sql`(${params.cursor.value})::numeric`;
      const cursorAffiliationId = Prisma.sql`(${params.cursor.affiliationId})::uuid`;
      cursorParts.push(Prisma.sql`(
        ${sortExpr} ${cursorCompare} ${cursorValue}
        OR (${sortExpr} = ${cursorValue} AND affiliation_id > ${cursorAffiliationId})
      )`);
    }

    const outerWhere = cursorParts.length > 0 ? Prisma.sql`WHERE ${Prisma.join(cursorParts, ' AND ')}` : Prisma.empty;

    const query = Prisma.sql`
      WITH search_results AS (${cteQuery})
      SELECT *, (${sortExpr})::text AS sort_value
      FROM search_results
      ${outerWhere}
      ORDER BY ${sortExpr} ${sortDirSql} NULLS LAST, affiliation_id ASC
      LIMIT ${params.limit}
    `;

    return this.prisma.$queryRaw<DoctorSearchRow[]>(query);
  }
}
