import { Matches } from 'class-validator';

/** File 10 §2.3: "E.164 format, validated by regex server-side" — no phone-number library. */
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export class ForgotPasswordDto {
  @Matches(E164_PATTERN, { message: 'phone must be a valid E.164 phone number, e.g. +201001234567' })
  phone: string;
}
