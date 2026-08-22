import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { AddressDto } from './address.dto';

class PartialAddressDto extends PartialType(AddressDto) {}

export class UpdateClinicBranchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ianaTimezone?: string;

  @ApiPropertyOptional({ type: PartialAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PartialAddressDto)
  address?: PartialAddressDto;
}
