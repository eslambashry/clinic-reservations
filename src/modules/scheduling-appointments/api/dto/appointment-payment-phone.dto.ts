import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Appointment payment contact data; Fawry only needs the patient's phone. */
export class AppointmentPaymentPhoneDto {
  @ApiProperty({ example: '+201012345678' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;
}
