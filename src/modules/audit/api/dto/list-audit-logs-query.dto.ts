import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/**
 * `GET /v1/audit-logs` (File 12 Part 32.15 read side). `action` and
 * `resourceType` are free-form strings rather than enums on purpose: every
 * module writes its own `<module>.<resource>.<verb>` vocabulary into
 * `audit_logs`, so an enum here would go stale the moment a module adds an
 * action.
 */
export class ListAuditLogsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @ApiPropertyOptional({ example: 'provider_directory.pharmacy.verify' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  action?: string;

  @ApiPropertyOptional({ example: 'pharmacy' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  resourceType?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @ApiPropertyOptional({ description: 'Inclusive lower bound on occurredAt (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive upper bound on occurredAt (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  /** Admin console offset mode. When present, `cursor` is ignored. */
  @ApiPropertyOptional({ minimum: 1, description: 'Offset page number (1-based). Takes precedence over cursor.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
