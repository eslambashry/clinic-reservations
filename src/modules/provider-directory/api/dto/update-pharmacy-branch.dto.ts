import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { BRANCH_CONTACT_PHONE_PATTERN } from './branch-contact-phone.pattern';
import { AddressDto } from './address.dto';

class PartialAddressDto extends PartialType(AddressDto) {}

export class UpdatePharmacyBranchDto {
  @ApiPropertyOptional({ example: '+201001234567' })
  @IsOptional()
  @Matches(BRANCH_CONTACT_PHONE_PATTERN, { message: 'phone must be a valid E.164 contact number, e.g. +201001234567' })
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
