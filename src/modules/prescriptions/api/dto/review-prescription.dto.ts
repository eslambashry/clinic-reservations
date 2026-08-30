import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrescriptionReviewDecision } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, MaxLength, ValidateNested } from 'class-validator';

/**
 * File 12 Part 37 (item 10): `prescriptionItemId` is optional — when given,
 * this corrects that existing item's `drugCode`/`quantity`; when omitted,
 * the pharmacist is entering a brand-new item from scratch. Both `drugCode`
 * and `quantity` are required either way — a fulfillable item (Phase 7)
 * needs both, and this is the only code path that ever sets either.
 */
export class ItemCorrectionDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Omit to create a new item instead of correcting an existing one.' })
  @IsOptional()
  @IsUUID()
  prescriptionItemId?: string;

  @ApiProperty()
  @IsString()
  drugCode: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}

/** File 11 05.7 / File 12 Part 37: pharmacist review decision. `itemCorrections` is the only field that can populate `prescription_items.drug_code` — the DB trigger requires this review row to be created first (enforced by the use-case, not this DTO). */
export class ReviewPrescriptionDto {
  @ApiProperty({ enum: ['ACCEPTED', 'REJECTED', 'NEEDS_CLARIFICATION'] })
  @IsIn(['ACCEPTED', 'REJECTED', 'NEEDS_CLARIFICATION'])
  decision: PrescriptionReviewDecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonCode?: string;

  @ApiPropertyOptional({ description: 'Required (must be true) if any corrected item is a controlled substance — File 10 §7.3.' })
  @IsOptional()
  @IsBoolean()
  controlledSubstanceConfirmed?: boolean;

  @ApiPropertyOptional({ type: [ItemCorrectionDto], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ItemCorrectionDto)
  itemCorrections?: ItemCorrectionDto[];
}
