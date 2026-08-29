import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Shared optional body for `fulfill`/`complete` (2026-08-29 addition).
 * `note` is accepted but not currently persisted anywhere — no column
 * exists on `pharmacy_orders` for a per-transition note, and `fulfill`/
 * `complete` are pure status flips with no audit-detail field to carry it
 * either. Same `not_persisted[]` precedent as ADR-005's accepted-but-discarded
 * registration fields — flagged here rather than silently dropped, not
 * something to "fix" without a concrete need to actually surface it.
 */
export class LifecycleTransitionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
