import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

/**
 * `display_name` (snake_case) matches the Flutter `auth` feature's existing
 * `PATCH /v1/auth/me` request body exactly — same scoped snake_case
 * exception as `SubmitProviderRegistrationDto` (ADR-005 Part 34.2), not the
 * File 12 Part 09 `camelCase` convention. `display_name` is split into
 * `User.first_name`/`last_name` server-side (see `UpdateCurrentUserUseCase`);
 * `email` maps straight to `User.email`. Both fields are `@IsOptional()` at
 * the DTO level purely so a partial PATCH stays valid — the onboarding
 * screen that is this endpoint's only caller today always sends both.
 */
export class UpdateMeDto {
  @ApiPropertyOptional({ description: 'Free-text full name; split on the first whitespace into first/last name' })
  @IsOptional()
  @IsString()
  display_name?: string;

  @ApiPropertyOptional({ description: 'User.email — unique; a conflicting email is silently dropped, see UpdateUserProfileUseCase' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
