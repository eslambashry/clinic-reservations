import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsLatitude, IsLongitude, IsOptional, IsString, Length } from 'class-validator';

/**
 * Structurally identical to `provider-directory`'s `AddressDto`, duplicated
 * rather than imported: `addresses` is a `provider-directory`-owned table
 * and this module reaches it through its own `LabAddressRepository`, so its
 * api layer must not depend on another module's api layer either (File 12
 * Part 05).
 */
export class LabAddressDto {
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

/**
 * A new pharmacy/lab branch must carry map coordinates (product decision,
 * 2026-10-03): patient discovery is PostGIS proximity search
 * (`ST_DWithin`), which silently skips any address without them, so a branch
 * created without coordinates would never appear to a patient sharing their
 * location. Only creation requires them; partial updates stay optional.
 */
export class LocatedLabAddressDto {
  // Standalone rather than `extends LabAddressDto`: class-validator merges
  // inherited metadata, so the parent's `@IsOptional()` would still let a
  // missing coordinate through.
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

  @ApiProperty({ example: 30.0444 })
  @IsDefined()
  @IsLatitude()
  geoLat: number;

  @ApiProperty({ example: 31.2357 })
  @IsDefined()
  @IsLongitude()
  geoLng: number;
}
