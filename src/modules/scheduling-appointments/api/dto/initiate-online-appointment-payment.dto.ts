import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { AppointmentPaymentBillingDto } from './appointment-payment-billing.dto';
import { AppointmentPaymentPhoneDto } from './appointment-payment-phone.dto';

const ONLINE_METHODS = ['CARD', 'FAWRY', 'MOBILE_WALLET'] as const;
const WALLET_PROVIDERS = ['VODAFONE_CASH', 'ETISALAT_CASH', 'ORANGE_CASH'] as const;

/** Egyptian mobile, local (`01XXXXXXXXX`) or E.164 (`+201XXXXXXXXX`) — Fawry's `debitMobileWalletNo`. */
const EGYPT_WALLET_MOBILE_PATTERN = /^(?:\+20|0)1[0125]\d{8}$/;

/** File 12 Part 50.1 `POST /v1/appointments/{holdId}/payments`. */
export class InitiateOnlineAppointmentPaymentDto {
  @ApiProperty({ enum: ONLINE_METHODS })
  @IsIn(ONLINE_METHODS)
  method: (typeof ONLINE_METHODS)[number];

  @ApiProperty({ type: AppointmentPaymentPhoneDto })
  @ValidateNested()
  @Type(() => AppointmentPaymentPhoneDto)
  customer: AppointmentPaymentPhoneDto;

  @ApiPropertyOptional({
    type: AppointmentPaymentBillingDto,
    description: 'Required for CARD (Paymob). Not needed for FAWRY or MOBILE_WALLET (both Fawry); accepted and ignored there so older app versions still validate.',
  })
  @ValidateIf((dto: InitiateOnlineAppointmentPaymentDto) => dto.method === 'CARD' || dto.billingData !== undefined)
  @IsDefined()
  @ValidateNested()
  @Type(() => AppointmentPaymentBillingDto)
  billingData?: AppointmentPaymentBillingDto;

  @ApiPropertyOptional({ example: '50.00', description: 'Optional partial amount, from the configured minimum (50 EGP) up to the consult fee. Omit to pay in full. Validated server-side; the client never sends the fee or the remaining balance.' })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  paymentAmount?: string;

  /**
   * File 12 Part 55: deprecated. Fawry MWALLET routes by the wallet number,
   * so this is never sent anywhere. Still accepted (the global pipe rejects
   * unknown fields) so older app versions don't start failing validation.
   */
  @ApiPropertyOptional({ enum: WALLET_PROVIDERS, deprecated: true, description: 'Deprecated and ignored — Fawry picks the wallet from walletMobileNumber.' })
  @IsOptional()
  @IsIn(WALLET_PROVIDERS)
  walletProvider?: (typeof WALLET_PROVIDERS)[number];

  @ApiPropertyOptional({
    example: '01012345678',
    description: 'Required when method=MOBILE_WALLET: the number the wallet is registered on (01XXXXXXXXX or +201XXXXXXXXX). Fawry sends the payment request to that wallet. Never a PIN/OTP.',
  })
  @ValidateIf((dto: InitiateOnlineAppointmentPaymentDto) => dto.method === 'MOBILE_WALLET' || dto.walletMobileNumber !== undefined)
  @IsString()
  @Matches(EGYPT_WALLET_MOBILE_PATTERN, { message: 'walletMobileNumber must be an Egyptian mobile number, e.g. 01012345678' })
  walletMobileNumber?: string;
}
