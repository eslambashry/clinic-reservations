import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `value` is only shape-checked as "an object" here; the per-policy-type
 * contract (`{ratePercent}` / `{feePercent}` / `{startHour,endHour}`) is
 * enforced in `policy-config.rules.ts`, which returns 422 rather than 400 —
 * the payload is valid JSON, it just violates the policy's rule (R12).
 */
export class UpsertPolicyConfigDto {
  @ApiPropertyOptional({ example: 'EG' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  regionCode?: string;

  @ApiProperty({
    description: 'COMMISSION_RATE {ratePercent}, CANCELLATION_TIER {feePercent}, NOTIFICATION_QUIET_HOURS {startHour,endHour}',
    example: { ratePercent: 15 },
  })
  @IsDefined()
  @IsObject()
  value!: Record<string, unknown>;
}
