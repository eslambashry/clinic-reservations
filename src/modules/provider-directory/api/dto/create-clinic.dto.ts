import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateClinicDto {
  @ApiProperty({ example: 'Nile Medical Group LLC' })
  @IsString()
  legalName: string;

  @ApiProperty({ example: 'Nile Clinic' })
  @IsString()
  brandName: string;

  @ApiPropertyOptional({ example: 'EG-TAX-998877' })
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional({ example: 'CAI' })
  @IsOptional()
  @IsString()
  regionCode?: string;
}
