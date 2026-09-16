import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDecimal, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 2026-08-29 decision (File 12 Part 39 follow-up, `docs/PROPOSED_CONTRACT.md`
 * §1 resolved): the pharmacist reads the prescription image and types one
 * total for the whole order and may add a patient-visible note — no per-item
 * pricing, ETA input, or drug data enters this request body. Supersedes the
 * original item-by-item `items[]` contract (File 10 lines 191-195).
 */
export class SubmitPharmacyOrderQuoteDto {
  @ApiProperty({ example: '225.00', description: 'Order price in EGP, hand-typed by the pharmacist.' })
  @IsDecimal({ decimal_digits: '0,2' })
  totalPrice: string;

  @ApiPropertyOptional({ description: 'Free text shown to the patient alongside the quote.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ description: 'Required (must be true) if the prescription includes a controlled substance — File 10 line 541.' })
  @IsOptional()
  @IsBoolean()
  controlledSubstanceConfirmed?: boolean;
}
