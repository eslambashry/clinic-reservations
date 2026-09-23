import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/**
 * `code` is deliberately absent: it is the primary key and the target of
 * `doctors.specialty_code`, so changing it would rewrite every doctor's
 * specialty. Create a new specialty instead.
 */
export class UpdateSpecialtyDto {
  @ApiPropertyOptional({ example: 'أمراض القلب' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name_ar?: string;

  /**
   * Explicit `null` clears the parent (makes the specialty top-level);
   * omitting the field leaves the current parent untouched.
   */
  @ApiPropertyOptional({
    example: 'INTERNAL_MEDICINE',
    nullable: true,
    description: 'null makes the specialty top-level; omit to leave unchanged.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  parent_code?: string | null;
}
