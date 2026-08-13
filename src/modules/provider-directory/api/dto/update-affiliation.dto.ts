import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimal, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class UpdateAffiliationDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAUSED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'PAUSED'])
  status?: 'ACTIVE' | 'PAUSED';

  @ApiPropertyOptional({ example: '350.00' })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  consultFee?: string;

  @ApiPropertyOptional({ example: 'EGP' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}
