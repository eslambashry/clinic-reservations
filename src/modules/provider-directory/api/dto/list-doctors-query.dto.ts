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

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
