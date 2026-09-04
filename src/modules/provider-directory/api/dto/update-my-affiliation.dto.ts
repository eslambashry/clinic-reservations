import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * File 12 Part 49.4 — `status` only. `consultFee`/`currency` stay on the
 * Admin-only `PATCH /v1/affiliations/{id}`: they feed the payments
 * commission split, so they are commercial rather than operational data.
 */
export class UpdateMyAffiliationDto {
  @ApiProperty({ enum: ['ACTIVE', 'PAUSED'] })
  @IsIn(['ACTIVE', 'PAUSED'])
  status: 'ACTIVE' | 'PAUSED';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  consultFee?: number;
}
