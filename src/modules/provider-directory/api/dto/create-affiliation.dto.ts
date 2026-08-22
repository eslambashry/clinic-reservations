import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsString, IsUUID, Length } from 'class-validator';

export class CreateAffiliationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clinicBranchId: string;

  @ApiProperty({ example: '350.00', description: 'Decimal(10,2) string' })
  @IsDecimal({ decimal_digits: '0,2' })
  consultFee: string;

  @ApiProperty({ example: 'EGP' })
  @IsString()
  @Length(3, 3)
  currency: string;
}
