import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FulfillmentType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsLatitude, IsLongitude, IsOptional, IsUUID } from 'class-validator';

/**
 * File 12 Part 39.2/39 (revised File 12 Part 46): `lat`/`lng` are required
 * only when `pharmacyBranchId` is omitted — there's no stored patient
 * address to fall back on, and broadcast fan-out has no meaning without a
 * location to search nearest branches from. When the caller already picked
 * a specific branch, that branch alone is broadcast to and its location is
 * irrelevant to the order, so forcing a GPS read just to submit was an
 * unnecessary UX blocker (`CreatePharmacyOrderUseCase.execute` enforces the
 * "required unless a branch is chosen" rule this DTO can't express alone).
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

  @ApiPropertyOptional({ example: 30.0444 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: 31.2357 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  pharmacyBranchId?: string;
}
