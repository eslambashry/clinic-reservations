import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class RecordResultDto {
  /**
   * Required when attaching a result to a historical per-order item.
   * Omitted for a referral order without item rows — the whole order's result
   * attaches directly, enforced in `RecordResultUseCase`, not here (a
   * cross-field rule against the order's own item count, File 12 Part 50).
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  itemId?: string;

  /** Optional display label — defaults to a generated name (`RecordResultUseCase.defaultFileLabel`) when omitted. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileLabel?: string;

  /** Optional — defaults to the actual uploaded file size when omitted. */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  sizeKb?: number;
}
