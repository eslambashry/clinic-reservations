import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';
import { AddressDto } from './address.dto';

export class CreateClinicBranchDto {
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
}
