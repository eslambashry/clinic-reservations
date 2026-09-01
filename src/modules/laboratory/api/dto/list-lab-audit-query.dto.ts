import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CUSTODY_EVENT_TYPES, CustodyEventType } from '../../domain/custody-action.util';

/** `GET /lab-audit` — mirrors `ListPharmacyAuditQueryDto`. `action` filters to one entry of the custody-event vocabulary, not a raw `audit_logs.action` string. */
export class ListLabAuditQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: CUSTODY_EVENT_TYPES })
  @IsOptional()
  @IsIn(CUSTODY_EVENT_TYPES)
  action?: CustodyEventType;

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
