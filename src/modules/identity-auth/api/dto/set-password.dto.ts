import { IsStrongPassword } from '../../../../shared/core/validation/is-strong-password.decorator';

export class SetPasswordDto {
  @IsStrongPassword()
  password: string;
}
