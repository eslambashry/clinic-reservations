import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, Matches, ValidateNested } from 'class-validator';
import { BRANCH_CONTACT_PHONE_PATTERN } from './branch-contact-phone.pattern';
import { AddressDto } from './address.dto';

export class CreateClinicBranchDto {
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
}
