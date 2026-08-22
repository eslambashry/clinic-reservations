import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Max, Min } from 'class-validator';

const SORT_VALUES = ['distance:asc', 'rating:desc', 'price:asc'] as const;

/**
 * File 10 §2.3's documented param set (`specialty, lat, lng, radiusKm, date,
 * sort, cursor, limit`) plus `q` (File 12 Part 32.10, additive). `date` is
 * accepted but not yet honored (Part 32.11 — no `appointment_slots` until
 * Phase 3).
 */
export class DoctorSearchQueryDto {
  @ApiPropertyOptional({ example: 'CARDIOLOGY' })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ description: 'Free-text name/specialty search (pg_trgm)' })
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

  @ApiPropertyOptional({ description: 'Accepted, not yet honored (Phase 3 dependency)' })
  @IsOptional()
  @IsISO8601()
  date?: string;

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
