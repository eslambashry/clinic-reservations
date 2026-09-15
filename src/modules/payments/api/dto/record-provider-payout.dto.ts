import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsOptional, IsString, MaxLength } from 'class-validator';

/** Admin-only `POST /v1/provider-payouts/:providerType/:providerId` — records a transfer that happened outside the system. */
export class RecordProviderPayoutDto {
  @ApiProperty({ example: '2500.00', description: 'Amount actually transferred to the provider, EGP. Must be > 0 and <= the current outstanding balance (enforced by the use-case, not this DTO).' })
  @IsDecimal({ decimal_digits: '0,2' })
  amount: string;

  @ApiPropertyOptional({ example: 'Bank transfer ref #12345, 2026-09-15', description: 'Free-text reference for this transfer — stored on the audit log, not a dedicated column.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
