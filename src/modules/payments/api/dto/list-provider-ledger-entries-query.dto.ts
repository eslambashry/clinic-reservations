import { ApiPropertyOptional } from '@nestjs/swagger';
import { LedgerEntryType, ProviderType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ListProviderLedgerEntriesQueryDto {
  @ApiPropertyOptional({ enum: ProviderType })
  @IsOptional()
  @IsEnum(ProviderType)
  providerType?: ProviderType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @ApiPropertyOptional({ enum: LedgerEntryType })
  @IsOptional()
  @IsEnum(LedgerEntryType)
  entryType?: LedgerEntryType;

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

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
