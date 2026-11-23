import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListWithdrawalsQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'COMPLETED', 'REJECTED', 'CANCELLED'] })
  @IsOptional()
  @IsEnum({ PENDING: 'PENDING', COMPLETED: 'COMPLETED', REJECTED: 'REJECTED', CANCELLED: 'CANCELLED' })
  status?: 'PENDING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
