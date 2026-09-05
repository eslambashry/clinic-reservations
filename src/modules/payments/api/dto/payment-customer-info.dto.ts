import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

/**
 * File 12 Part 50: Paymob's `billing_data` requires a name/email/phone
 * regardless of payment method. Collected from the client's checkout form
 * rather than read from the `User` profile — `identity-auth` exports no
 * full-phone/email lookup for cross-module use (only the PHI-minimal,
 * masked-phone `GetUserSummaryUseCase` projection), and a checkout form is
 * where this is realistically confirmed/edited anyway.
 */
export class PaymentCustomerInfoDto {
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

  @ApiProperty()
  @IsString()
  @MaxLength(20)
  phone: string;
}
