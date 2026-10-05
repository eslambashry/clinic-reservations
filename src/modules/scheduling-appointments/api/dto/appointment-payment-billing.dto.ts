import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

/** Billing data required only for CARD (Paymob). FAWRY and MOBILE_WALLET go through Fawry, which gets the phone only (File 12 Part 55). */
export class AppointmentPaymentBillingDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  firstName: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  lastName: string;

  @ApiProperty()
  @IsEmail()
  email: string;
}
