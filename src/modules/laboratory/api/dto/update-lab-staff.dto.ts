import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsStrongPassword } from '../../../../shared/core/validation/is-strong-password.decorator';

/** Same scoped snake_case exception as `CreateLabStaffDto`. Every field optional — a partial PATCH must stay valid. */
export class UpdateLabStaffDto {
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

  @ApiPropertyOptional({ example: 'Lab manager' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'Sample intake and results' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtitle?: string;
}
