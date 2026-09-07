import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsStrongPassword } from '../../../../shared/core/validation/is-strong-password.decorator';

/** Same scoped snake_case exception as `CreateAssistantDto`. Both fields optional — a partial PATCH must stay valid. */
export class UpdateAssistantDto {
  @ApiPropertyOptional({ example: 'Sara Ahmed' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  display_name?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ example: 'NewPass1!' })
  @IsOptional()
  @IsString()
  @IsStrongPassword()
  password?: string;

  @ApiPropertyOptional({ example: 'Front desk' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'Reception & check-in' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtitle?: string;

  /** Full replace of the assistant's assigned branches when provided (not a diff/patch). */
  @ApiPropertyOptional({ example: ['b1a2c3d4-0000-4000-8000-000000000001'], type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  clinic_branch_ids?: string[];
}
