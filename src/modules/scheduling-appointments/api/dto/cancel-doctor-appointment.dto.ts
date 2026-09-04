import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * File 12 Part 49.8. `reason` is a single-value enum rather than the
 * patient DTO's three-way one: a doctor cancelling their own appointment is
 * always `PROVIDER_REQUEST`, which is what waives the cancellation fee
 * entirely (File 11 line 475 / Part 36.8). Constraining it here means the
 * common mistake is a 400 at the DTO boundary; the use-case still re-checks
 * it (Part 49.8) so the rule holds even for a caller bypassing this DTO.
 *
 * `note` is where the doctor explains *why* — it is appended to
 * `appointments.cancelled_reason` and shown to the patient, so it is not
 * optional in spirit even though it is in schema.
 */
export class CancelDoctorAppointmentDto {
  @ApiProperty({ enum: ['PROVIDER_REQUEST'], default: 'PROVIDER_REQUEST' })
  @IsIn(['PROVIDER_REQUEST'])
  reason = 'PROVIDER_REQUEST' as const;

  @ApiPropertyOptional({ description: 'Shown to the patient alongside the cancellation.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
