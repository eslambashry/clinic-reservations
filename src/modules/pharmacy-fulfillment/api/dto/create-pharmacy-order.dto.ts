import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FulfillmentType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsLatitude, IsLongitude, IsOptional, IsUUID } from 'class-validator';

/**
 * File 12 Part 39.2/39: `lat`/`lng` are required, not optional like
 * `pharmacy-branch-search`'s — there's no stored patient address to fall
 * back on, and broadcast fan-out has no meaning without a location to
 * search nearest branches from.
 *
 * `pharmacyBranchId` (File 12 Part 44) is optional: when given, the order is
 * broadcast to exactly that one branch instead of the nearest verified
 * branches found from `lat`/`lng` — the branch still has to `accept` it
 * like any other broadcast, nothing about that mechanism changes.
 */
export class CreatePharmacyOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  prescriptionId: string;

  @ApiProperty({ enum: ['PICKUP', 'DELIVERY'] })
  @IsIn(['PICKUP', 'DELIVERY'])
  fulfillmentType: FulfillmentType;

  @ApiProperty({ example: 30.0444 })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 31.2357 })
  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  pharmacyBranchId?: string;
}
