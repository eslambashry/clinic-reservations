import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

const PAYOUT_METHODS = ['IBAN', 'WALLET_NUMBER'] as const;

/** `POST /v1/wallet/withdrawals`. */
export class CreateWithdrawalDto {
  @ApiProperty({ example: '100.00' })
  @IsDecimal({ decimal_digits: '0,2' })
  amount: string;

  @ApiProperty({ example: 'Mahmoud Ahmed' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  accountHolderName: string;

  @ApiProperty({ enum: PAYOUT_METHODS })
  @IsIn(PAYOUT_METHODS)
  payoutMethod: (typeof PAYOUT_METHODS)[number];

  @ApiProperty({ example: 'EG380019000500000000263180002', description: 'IBAN, or an Egyptian wallet mobile number (01XXXXXXXXX)' })
  @IsString()
  @MaxLength(64)
  payoutAccount: string;
}
