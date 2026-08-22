import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsOptional, IsString, Length } from 'class-validator';

export class AddressDto {
  @ApiProperty({ example: '12 Tahrir St' })
  @IsString()
  line1: string;

  @ApiProperty({ example: 'Cairo' })
  @IsString()
  city: string;

  @ApiProperty({ example: 'CAI', description: 'Region/governorate code' })
  @IsString()
  regionCode: string;

  @ApiProperty({ example: 'EG', description: 'ISO 3166-1 alpha-2 country code' })
  @IsString()
  @Length(2, 2)
  countryCode: string;

  @ApiPropertyOptional({ example: 30.0444 })
  @IsOptional()
  @IsLatitude()
  geoLat?: number;

  @ApiPropertyOptional({ example: 31.2357 })
  @IsOptional()
  @IsLongitude()
  geoLng?: number;
}
