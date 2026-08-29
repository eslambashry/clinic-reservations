import { ApiPropertyOptional } from '@nestjs/swagger';
import { PharmacyOrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * `GET /pharmacy-orders` (2026-08-29 addition — File 12 Part 39 item 11's
 * named-but-unbuilt queue listing, built here at this route instead of the
 * `GET /pharmacy-branches/{branchId}/orders` File 11 05.8 named, matching
 * this controller's own convention of resolving the caller's branch
 * server-side rather than taking it as a request parameter).
 */
export class ListPharmacyOrdersQueryDto {
  @ApiPropertyOptional({ enum: PharmacyOrderStatus })
  @IsOptional()
  @IsEnum(PharmacyOrderStatus)
  status?: PharmacyOrderStatus;

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
