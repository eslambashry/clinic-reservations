import { IsNotEmpty, Matches } from 'class-validator';

/** File 10 §2.3: "E.164 format, validated by regex server-side" — restricted to Egyptian mobile numbers. */
const EGYPT_E164_PATTERN = /^\+201[0125]\d{8}$/;

export class LoginWithPasswordDto {
  @Matches(EGYPT_E164_PATTERN, { message: 'phone must be a valid Egyptian mobile number, e.g. +201001234567' })
  phone: string;

  @IsNotEmpty()
  password: string;
}
