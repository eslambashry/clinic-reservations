import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { AddressDto } from './address.dto';

export class CreatePharmacyBranchDto {
  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @ApiProperty({ example: '+20221234567' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'Africa/Cairo' })
  @IsString()
  ianaTimezone: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  deliveryCapable?: boolean;
}
