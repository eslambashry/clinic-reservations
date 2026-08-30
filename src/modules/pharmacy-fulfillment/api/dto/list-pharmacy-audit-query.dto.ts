import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PHARMACY_AUDIT_ACTIONS, PharmacyAuditAction } from '../../application/list-pharmacy-audit.use-case';

/**
 * `GET /pharmacy-audit` (2026-08-29 addition — `docs/PROPOSED_CONTRACT.md`
 * §6, resolved). `search` is free text over patient name / detail / the
 * derived order code (`ListPharmacyAuditUseCase` matches it in memory, not a
 * SQL `LIKE`); `action` filters to one entry of this console's own audit
 * vocabulary, not a raw `audit_logs.action` string.
 */
export class ListPharmacyAuditQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: PHARMACY_AUDIT_ACTIONS })
  @IsOptional()
  @IsIn(PHARMACY_AUDIT_ACTIONS)
  action?: PharmacyAuditAction;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 40 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
