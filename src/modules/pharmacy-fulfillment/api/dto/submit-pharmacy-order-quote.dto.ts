import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PharmacyOrderItemStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDecimal, IsIn, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

/**
 * File 10 lines 191-195. `estimatedReadyMinutes` from that same request
 * shape is deliberately omitted (File 12 Part 39) — no column exists to
 * persist it yet.
 */
export class QuoteItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  prescriptionItemId: string;

  @ApiProperty({ enum: ['AVAILABLE', 'UNAVAILABLE', 'SUBSTITUTED'] })
  @IsIn(['AVAILABLE', 'UNAVAILABLE', 'SUBSTITUTED'])
  status: PharmacyOrderItemStatus;

  @ApiPropertyOptional({ description: 'Required when status is SUBSTITUTED.' })
  @IsOptional()
  @IsString()
  substituteDrugCode?: string;

  @ApiPropertyOptional({ description: 'Required when status is AVAILABLE or SUBSTITUTED.' })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  unitPrice?: string;
}

export class SubmitPharmacyOrderQuoteDto {
  @ApiProperty({ type: [QuoteItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items: QuoteItemDto[];

  @ApiPropertyOptional({ description: 'Required (must be true) if any dispensed item is a controlled substance — File 10 line 541.' })
  @IsOptional()
  @IsBoolean()
  controlledSubstanceConfirmed?: boolean;
}
