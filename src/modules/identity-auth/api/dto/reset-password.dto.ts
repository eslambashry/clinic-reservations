import { IsUUID, Matches } from 'class-validator';
import { IsStrongPassword } from '../../../../shared/core/validation/is-strong-password.decorator';

export class ResetPasswordDto {
  @IsUUID()
  requestId: string;

  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit numeric string' })
  code: string;

  @IsStrongPassword()
  newPassword: string;
}
