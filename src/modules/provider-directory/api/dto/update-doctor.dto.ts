import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateDoctorDto {
  @ApiPropertyOptional({ example: 'CARDIOLOGY' })
  @IsOptional()
  @IsString()
  specialtyCode?: string;

  @ApiPropertyOptional({ example: 'EG-MED-12345' })
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @ApiPropertyOptional({ example: 'CAI' })
  @IsOptional()
  @IsString()
  regionCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  photoUrl?: string;
}
