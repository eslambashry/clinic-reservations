import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class RecordResultDto {
  /**
   * Required for a catalog-based order (one result per registered
   * `LabOrderItem`). Omitted for a freeform order (patient uploaded an
   * image instead of picking catalog tests) — the whole order's result
   * attaches directly, enforced in `RecordResultUseCase`, not here (a
   * cross-field rule against the order's own item count, File 12 Part 50).
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiProperty({ description: 'Registration-only file reference — real storage vendor undecided (File 10 uploads rule).' })
  @IsString()
  @MaxLength(255)
  fileLabel: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  sizeKb: number;
}
