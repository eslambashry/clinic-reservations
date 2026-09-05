import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

const EGYPT_E164_PATTERN = /^\+201[0125]\d{8}$/;

export class CreateMyClinicBranchAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  line1: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  regionCode: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2)
  countryCode: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  geoLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  geoLng?: number;
}

export class CreateMyClinicBranchDto {
  @Matches(EGYPT_E164_PATTERN, { message: 'phone must be a valid Egyptian mobile number, e.g. +201001234567' })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  ianaTimezone: string;

  @ValidateNested()
  @Type(() => CreateMyClinicBranchAddressDto)
  address: CreateMyClinicBranchAddressDto;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  consultFee: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}
