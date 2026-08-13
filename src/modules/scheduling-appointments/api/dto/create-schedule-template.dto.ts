import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** File 12 Part 33.6: `"HH:mm"` 24-hour, local to the affiliation's clinic branch timezone. */
export class CreateScheduleTemplateDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  doctorClinicAffiliationId: string;

  @ApiProperty({ minimum: 1, maximum: 7, description: 'ISO-8601 weekday, 1=Monday…7=Sunday (Part 33.5)' })
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;

  @ApiProperty({ example: '09:00' })
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
