import { IsUUID, Matches } from 'class-validator';

export class ConfirmAccountDeletionDto {
  @IsUUID()
  requestId: string;

  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit numeric string' })
  code: string;
}
