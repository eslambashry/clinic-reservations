import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DoctorRequestStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class AdminListDoctorRequestsQueryDto {
  @ApiPropertyOptional({ enum: DoctorRequestStatus })
  @IsOptional()
  @IsEnum(DoctorRequestStatus)
  status?: DoctorRequestStatus;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class UpdateDoctorRequestStatusDto {
  @ApiProperty({ enum: DoctorRequestStatus })
  @IsEnum(DoctorRequestStatus)
  status: DoctorRequestStatus;

  @ApiPropertyOptional({ maxLength: 500, description: 'Shown to the patient with the new status.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNote?: string;
}
