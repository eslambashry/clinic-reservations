import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

/** File 10 §2.3: `clinicBranchId` required (a doctor can have different slots per affiliation), `from`/`to` optional (Part 33.16 default). */
export class GetDoctorSlotsQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clinicBranchId: string;

  @ApiPropertyOptional({ description: 'Defaults to today (UTC) if omitted' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Defaults to from+14 days if omitted; span capped at 14 days' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
