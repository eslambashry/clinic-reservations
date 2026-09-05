import { IsUUID } from 'class-validator';
import { IsStrongPassword } from '../../../../shared/core/validation/is-strong-password.decorator';

export class ResetPasswordDto {
  @IsUUID()
  requestId: string;

  @IsStrongPassword()
  newPassword: string;
}
