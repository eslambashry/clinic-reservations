import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelAppointmentDto {
  @ApiProperty({ enum: ['PATIENT_REQUEST', 'PROVIDER_REQUEST', 'OTHER'] })
  @IsIn(['PATIENT_REQUEST', 'PROVIDER_REQUEST', 'OTHER'])
  reason: 'PATIENT_REQUEST' | 'PROVIDER_REQUEST' | 'OTHER';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
