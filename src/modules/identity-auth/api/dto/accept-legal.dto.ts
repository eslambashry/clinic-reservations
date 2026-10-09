import { IsString, MaxLength } from 'class-validator';

export class AcceptLegalDto {
  @IsString()
  @MaxLength(20)
  version: string;
}
