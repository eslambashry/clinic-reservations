import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

const EGYPT_E164_PATTERN = /^\+201[0125]\d{8}$/;

/**
 * File 12 Part 49.3 — the operational half of a clinic branch. Only `line1`
 * and `city` are editable here; `regionCode`/`countryCode`/`geoLat`/`geoLng`
 * stay on the Admin-only `PATCH /v1/clinic-branches/{id}` because they
 * partition search results rather than describe day-to-day operations.
 */
export class UpdateMyClinicBranchAddressDto {
  @ApiPropertyOptional({ example: '12 Tahrir St' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  line1?: string;

  @ApiPropertyOptional({ example: 'Cairo' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;
}

export class UpdateMyClinicBranchDto {
  @ApiPropertyOptional({ example: '+201001234567' })
  @IsOptional()
  @Matches(EGYPT_E164_PATTERN, { message: 'phone must be a valid Egyptian mobile number, e.g. +201001234567' })
  phone?: string;

  @ApiPropertyOptional({ example: 'Africa/Cairo', description: 'IANA timezone the branch’s schedule templates are interpreted in' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ianaTimezone?: string;

  @ApiPropertyOptional({ type: UpdateMyClinicBranchAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateMyClinicBranchAddressDto)
  address?: UpdateMyClinicBranchAddressDto;
}
