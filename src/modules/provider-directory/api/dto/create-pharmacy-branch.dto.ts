import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { BRANCH_CONTACT_PHONE_PATTERN } from './branch-contact-phone.pattern';
import { AddressDto } from './address.dto';

export class CreatePharmacyBranchDto {
  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @ApiProperty({ example: '+201001234567' })
  @Matches(BRANCH_CONTACT_PHONE_PATTERN, { message: 'phone must be a valid E.164 contact number, e.g. +201001234567' })
  phone: string;

  @ApiProperty({ example: 'Africa/Cairo' })
  @IsString()
  ianaTimezone: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  deliveryCapable?: boolean;
}
