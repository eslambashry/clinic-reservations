import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';

/**
 * `code` is deliberately absent: it is a generated UUID primary key and the
 * target of `doctors.specialty_code`.
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
    format: 'uuid',
    nullable: true,
    description: 'null makes the specialty top-level; omit to leave unchanged.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  parent_code?: string | null;
}
