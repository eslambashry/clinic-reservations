import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
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
}
