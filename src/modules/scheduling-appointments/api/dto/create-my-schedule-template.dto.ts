import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * File 12 Part 49.5 — identical field set to `CreateScheduleTemplateDto`
 * (the Admin one) on purpose: the same `schedule_templates` row is being
 * written, only the authorization scope differs. `doctorClinicAffiliationId`
 * names *which of the caller's own* affiliations to attach to; it is
 * re-checked against the JWT-derived scope in the use-case and never trusted
 * as proof of ownership.
 */
export class CreateMyScheduleTemplateDto {
  @ApiProperty({ format: 'uuid', description: "One of the caller's own affiliations — verified server-side" })
  @IsUUID()
  doctorClinicAffiliationId: string;

  @ApiProperty({ minimum: 1, maximum: 7, description: 'ISO-8601 weekday, 1=Monday…7=Sunday (Part 33.5)' })
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;

  @ApiProperty({ example: '09:00', description: "Local to the branch's ianaTimezone (Part 33.6)" })
  @Matches(HH_MM)
  startTime: string;

  @ApiProperty({ example: '17:00' })
  @Matches(HH_MM)
  endTime: string;

  @ApiProperty({ minimum: 5, maximum: 240 })
  @IsInt()
  @Min(5)
  @Max(240)
  slotDurationMinutes: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 120, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  bufferMinutes: number = 0;
}
