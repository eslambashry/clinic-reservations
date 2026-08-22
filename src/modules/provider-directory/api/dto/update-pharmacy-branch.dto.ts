import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { AddressDto } from './address.dto';

class PartialAddressDto extends PartialType(AddressDto) {}

export class UpdatePharmacyBranchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
