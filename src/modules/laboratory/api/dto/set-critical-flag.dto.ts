import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** The human critical-value call (DEC-003) — never automated. */
export class SetCriticalFlagDto {
  @ApiProperty()
  @IsBoolean()
  isCritical: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
