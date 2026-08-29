import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDecimal, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { QUOTE_ESTIMATED_READY_MINUTES_MAX, QUOTE_ESTIMATED_READY_MINUTES_MIN } from '../../domain/pharmacy-order-quote.rules';

/**
 * 2026-08-29 decision (File 12 Part 39 follow-up, `docs/PROPOSED_CONTRACT.md`
 * §1 resolved): the pharmacist reads the prescription image and types one
 * total for the whole order — no per-item pricing, no drug data of any kind
 * enters this dashboard or this request body. Supersedes the original
 * item-by-item `items[]` contract (File 10 lines 191-195).
 */
export class SubmitPharmacyOrderQuoteDto {
  @ApiProperty({ example: '225.00', description: 'Total the patient will pay, EGP. Hand-typed by the pharmacist.' })
  @IsDecimal({ decimal_digits: '0,2' })
  totalPrice: string;

  @ApiProperty({ minimum: QUOTE_ESTIMATED_READY_MINUTES_MIN, maximum: QUOTE_ESTIMATED_READY_MINUTES_MAX, example: 45 })
  @IsInt()
  @Min(QUOTE_ESTIMATED_READY_MINUTES_MIN)
  @Max(QUOTE_ESTIMATED_READY_MINUTES_MAX)
  estimatedReadyMinutes: number;

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
