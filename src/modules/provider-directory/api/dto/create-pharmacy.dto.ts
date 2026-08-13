import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreatePharmacyDto {
  @ApiProperty({ example: 'Nile Pharma LLC' })
  @IsString()
  legalName: string;

  @ApiProperty({ example: 'Nile Pharmacy' })
  @IsString()
  brandName: string;

  @ApiPropertyOptional({ example: 'EG-TAX-112233' })
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional({ example: 'CAI' })
  @IsOptional()
  @IsString()
  regionCode?: string;
}
