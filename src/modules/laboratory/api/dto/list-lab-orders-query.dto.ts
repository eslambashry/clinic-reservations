import { ApiPropertyOptional } from '@nestjs/swagger';
import { LabOrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** `GET /lab-orders` — mirrors `ListPharmacyOrdersQueryDto` exactly. */
export class ListLabOrdersQueryDto {
  @ApiPropertyOptional({ enum: LabOrderStatus })
  @IsOptional()
  @IsEnum(LabOrderStatus)
  status?: LabOrderStatus;

  @ApiPropertyOptional({ enum: ['createdAt:asc', 'createdAt:desc'], default: 'createdAt:desc' })
  @IsOptional()
  @IsIn(['createdAt:asc', 'createdAt:desc'])
  sort?: 'createdAt:asc' | 'createdAt:desc';

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
