import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/** File 10 §2.3: "E.164 format, validated by regex server-side" — same pattern as `RequestOtpDto`/`LoginWithPasswordDto`. */
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

/**
 * `display_name` (snake_case) matches the Flutter `provider_dashboard`
 * feature's request body exactly — same scoped snake_case exception as
 * `UpdateMeDto`/`SubmitProviderRegistrationDto`, not the File 12 Part 09
 * camelCase convention.
 */
export class CreateAssistantDto {
  @ApiProperty({ example: '+201001234567' })
  @Matches(E164_PATTERN, { message: 'phone must be a valid E.164 phone number, e.g. +201001234567' })
  phone: string;

  @ApiProperty({ example: 'Sara Ahmed' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  display_name: string;
}
