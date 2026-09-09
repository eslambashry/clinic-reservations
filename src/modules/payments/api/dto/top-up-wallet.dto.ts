import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDecimal, ValidateNested } from 'class-validator';
import { PaymentCustomerInfoDto } from './payment-customer-info.dto';

/** File 12 Part 50.3 `POST /v1/wallet/top-up` — card-only, per the business requirement. */
export class TopUpWalletDto {
  @ApiProperty({ example: '300.00', description: 'Amount to add to the wallet, EGP. Must be > 0 (enforced by the use-case, not this DTO).' })
  @IsDecimal({ decimal_digits: '0,2' })
  amount: string;

  @ApiProperty({ type: PaymentCustomerInfoDto })
  @ValidateNested()
  @Type(() => PaymentCustomerInfoDto)
  customer: PaymentCustomerInfoDto;
}
