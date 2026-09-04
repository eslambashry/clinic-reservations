import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
