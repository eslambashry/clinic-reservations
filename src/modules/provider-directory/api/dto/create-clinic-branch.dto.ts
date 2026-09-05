import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Matches, ValidateNested } from 'class-validator';
import { AddressDto } from './address.dto';

const EGYPT_E164_PATTERN = /^\+201[0125]\d{8}$/;

export class CreateClinicBranchDto {
  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @ApiProperty({ example: '+201001234567' })
  @Matches(EGYPT_E164_PATTERN, { message: 'phone must be a valid Egyptian mobile number, e.g. +201001234567' })
  phone: string;

  @ApiProperty({ example: 'Africa/Cairo' })
  @IsString()
  ianaTimezone: string;
}
