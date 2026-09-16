import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { LabAddressDto } from './address.dto';

const EGYPT_E164_PATTERN = /^\+201[0125]\d{8}$/;

class PartialLabAddressDto extends PartialType(LabAddressDto) {}

export class UpdateLabBranchDto {
  @ApiPropertyOptional({ example: '+201001234567' })
  @IsOptional()
  @Matches(EGYPT_E164_PATTERN, { message: 'phone must be a valid Egyptian mobile number, e.g. +201001234567' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ianaTimezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  homeCollectionCapable?: boolean;

  @ApiPropertyOptional({ type: PartialLabAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PartialLabAddressDto)
  address?: PartialLabAddressDto;
}
