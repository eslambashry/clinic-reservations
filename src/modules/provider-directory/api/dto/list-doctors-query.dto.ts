import { ApiPropertyOptional } from '@nestjs/swagger';
import { DoctorStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Admin review queue (mirrors `ListVerificationDocumentsQueryDto`'s shape). */
export class ListDoctorsQueryDto {
  @ApiPropertyOptional({ enum: DoctorStatus, description: 'Defaults to no filter — every status' })
  @IsOptional()
  @IsEnum(DoctorStatus)
  status?: DoctorStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  /** Admin console offset mode. When present, `cursor` is ignored. */
  @ApiPropertyOptional({ minimum: 1, description: 'Offset page number (1-based). Takes precedence over cursor.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
