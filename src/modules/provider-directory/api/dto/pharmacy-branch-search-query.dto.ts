import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Max, Min } from 'class-validator';

const SORT_VALUES = ['distance:asc', 'name:asc'] as const;

/**
 * File 12 Part 37 — no source doc documents a pharmacy-search contract (only
 * `GET /v1/doctors/search`, File 10 §2.3). Mirrors `DoctorSearchQueryDto`
 * where the underlying columns exist (`q`, `lat`/`lng`/`radiusKm`, `cursor`,
 * `limit`), drops what doesn't (`specialty`, `date` — no doctor-shaped
 * equivalent), and adds `deliveryCapable` as a boolean filter since
 * `PharmacyBranch` has no `rating_avg`/`consult_fee` to sort by instead.
 */
export class PharmacyBranchSearchQueryDto {
  @ApiPropertyOptional({ description: 'Free-text brand-name search (pg_trgm)' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 30.0444 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: 31.2357 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ default: 15 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(200)
  radiusKm?: number;

  @ApiPropertyOptional({ description: 'Filter to branches that deliver' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  deliveryCapable?: boolean;

  @ApiPropertyOptional({ enum: SORT_VALUES })
  @IsOptional()
  @IsIn(SORT_VALUES)
  sort?: (typeof SORT_VALUES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
