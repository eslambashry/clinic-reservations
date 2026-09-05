import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, Matches, ValidateNested } from 'class-validator';
import { AddressDto } from './address.dto';

const EGYPT_E164_PATTERN = /^\+201[0125]\d{8}$/;

class PartialAddressDto extends PartialType(AddressDto) {}

export class UpdatePharmacyBranchDto {
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
  deliveryCapable?: boolean;

  @ApiPropertyOptional({ type: PartialAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PartialAddressDto)
  address?: PartialAddressDto;
}
