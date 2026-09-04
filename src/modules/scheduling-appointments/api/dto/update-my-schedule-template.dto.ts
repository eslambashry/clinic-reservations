import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateMyScheduleTemplateDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(HH_MM)
  startTime?: string;

  @ApiPropertyOptional({ example: '17:00' })
  @IsOptional()
  @Matches(HH_MM)
  endTime?: string;

  @ApiPropertyOptional({ minimum: 5, maximum: 240 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  slotDurationMinutes?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 120 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  bufferMinutes?: number;

  @ApiPropertyOptional({
    minimum: 1,
    description:
      'File 12 Part 49.6 — the `version` from the read this edit is based on. Send it to get a 409 OPTIMISTIC_LOCK_CONFLICT on a concurrent edit instead of clobbering it; omit for last-write-wins.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}
