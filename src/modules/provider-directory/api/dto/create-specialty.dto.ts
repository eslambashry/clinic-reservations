import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateSpecialtyDto {
  /**
   * The primary key, and what `doctors.specialty_code` references — set once
   * here and never editable afterwards (see `UpdateSpecialtyDto`). The
   * pattern matches the existing seeded codes (CARDIOLOGY,
   * OBSTETRICS_AND_GYNECOLOGY).
   */
  @ApiProperty({ example: 'CARDIOLOGY', description: 'SCREAMING_SNAKE_CASE. Immutable once created.' })
  @IsString()
  @Matches(/^[A-Z][A-Z_]*[A-Z]$|^[A-Z]$/, {
    message: 'code must be SCREAMING_SNAKE_CASE (A-Z and underscores, not starting or ending with "_")',
  })
  @MaxLength(64)
  code: string;

  @ApiProperty({ example: 'أمراض القلب' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name_ar: string;

  @ApiPropertyOptional({ example: 'INTERNAL_MEDICINE', description: 'Parent specialty code; omit for a top-level specialty.' })
  @IsOptional()
  @IsString()
  parent_code?: string;
}
