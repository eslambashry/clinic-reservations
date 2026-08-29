import { ApiPropertyOptional } from '@nestjs/swagger';
import { PharmacyOrderRejectionReason } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `POST /pharmacy-orders/{orderId}/reject`, `PHARMACY_STAFF` actor —
 * rejects an `UNDER_REVIEW` order outright (2026-08-29 addition, mirrors
 * `medsuper-pharmacy-dashboard`'s `RejectOrderRequest`). Distinct from the
 * same route's `PATIENT` semantics (rejecting a proposed substitution, no
 * body) — the controller dispatches on the caller's role, so `reason` is
 * `@IsOptional` at the DTO layer (a `PATIENT` caller sends no body at all)
 * and its actual required-ness for the `PHARMACY_STAFF` path is enforced by
 * `RejectPharmacyOrderUseCase` instead.
 */
export class RejectPharmacyOrderDto {
  @ApiPropertyOptional({ enum: ['OUT_OF_STOCK', 'CANNOT_FULFILL', 'OTHER'] })
  @IsOptional()
  @IsIn(['OUT_OF_STOCK', 'CANNOT_FULFILL', 'OTHER'])
  reason?: PharmacyOrderRejectionReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
