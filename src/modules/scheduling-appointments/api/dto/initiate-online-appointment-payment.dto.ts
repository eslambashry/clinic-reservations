import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { PaymentCustomerInfoDto } from '../../../payments/api/dto/payment-customer-info.dto';

const ONLINE_METHODS = ['CARD', 'FAWRY', 'MOBILE_WALLET'] as const;
const WALLET_PROVIDERS = ['VODAFONE_CASH', 'ETISALAT_CASH', 'ORANGE_CASH'] as const;

/** File 12 Part 50.1 `POST /v1/appointments/{holdId}/payments`. */
export class InitiateOnlineAppointmentPaymentDto {
  @ApiProperty({ enum: ONLINE_METHODS })
  @IsIn(ONLINE_METHODS)
  method: (typeof ONLINE_METHODS)[number];

  @ApiProperty({ type: PaymentCustomerInfoDto })
  @ValidateNested()
  @Type(() => PaymentCustomerInfoDto)
  customer: PaymentCustomerInfoDto;

  @ApiPropertyOptional({ enum: WALLET_PROVIDERS, description: 'Required when method=MOBILE_WALLET' })
  @IsOptional()
  @IsIn(WALLET_PROVIDERS)
  walletProvider?: (typeof WALLET_PROVIDERS)[number];

  @ApiPropertyOptional({ description: 'Wallet-linked mobile number — required when method=MOBILE_WALLET. Never a PIN/OTP.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  walletMobileNumber?: string;
}
