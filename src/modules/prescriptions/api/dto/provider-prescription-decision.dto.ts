import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrescriptionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ApproveProviderPrescriptionDto {
  @ApiProperty({ minimum: 1, description: 'Version from the pending prescription response.' })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class RejectProviderPrescriptionDto {
  @ApiProperty({ minimum: 1, description: 'Version from the pending prescription response.' })
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class ListProviderPrescriptionsQueryDto {
  @ApiPropertyOptional({ enum: PrescriptionStatus })
  @IsOptional()
  @IsEnum(PrescriptionStatus)
  status?: PrescriptionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
