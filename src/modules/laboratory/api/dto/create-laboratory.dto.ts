import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateLaboratoryDto {
  @ApiProperty({ example: 'Nile Diagnostics LLC' })
  @IsString()
  legalName: string;

  @ApiProperty({ example: 'Nile Labs' })
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
