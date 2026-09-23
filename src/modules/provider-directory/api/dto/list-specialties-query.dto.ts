import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListSpecialtiesQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive match against name_ar or code.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
