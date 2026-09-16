import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Admin review queue (mirrors `ListDoctorsQueryDto`'s shape). */
export class ListLaboratoriesQueryDto {
  @ApiPropertyOptional({ enum: ProviderStatus, description: 'Defaults to no filter — every status' })
  @IsOptional()
  @IsEnum(ProviderStatus)
  status?: ProviderStatus;

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

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
