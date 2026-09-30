import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

/** Same pattern as `CreateClinicStaffAppointmentDto`'s `patientPhone` — redeclared locally, not shared, per this codebase's convention. */
const EGYPT_E164_PATTERN = /^\+201[0125]\d{8}$/;

export class LookupPatientByPhoneQueryDto {
  @ApiProperty({ example: '+201001234567' })
  @Matches(EGYPT_E164_PATTERN, { message: 'phone must be a valid Egyptian mobile number, e.g. +201001234567' })
  phone!: string;
}
