import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateClinicStaffAppointmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  patientId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  slotId!: string;
}