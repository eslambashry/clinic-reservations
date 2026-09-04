import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Password policy: 8-64 chars, at least one uppercase, one lowercase, one
 * digit, and one non-alphanumeric symbol.
 */
const UPPERCASE_PATTERN = /[A-Z]/;
const LOWERCASE_PATTERN = /[a-z]/;
const DIGIT_PATTERN = /\d/;
const SYMBOL_PATTERN = /[^A-Za-z0-9]/;

/**
 * Reusable class-validator decorator enforcing a strong password policy:
 * a string of 8-64 characters containing at least one uppercase letter,
 * one lowercase letter, one digit, and one non-alphanumeric symbol.
 *
 * Usage:
 *   class SomeDto {
 *     @IsStrongPassword()
 *     password: string;
 *   }
 */
export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, _args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          if (value.length < 8 || value.length > 64) return false;
          if (!UPPERCASE_PATTERN.test(value)) return false;
          if (!LOWERCASE_PATTERN.test(value)) return false;
          if (!DIGIT_PATTERN.test(value)) return false;
          if (!SYMBOL_PATTERN.test(value)) return false;
          return true;
        },
        defaultMessage(_args: ValidationArguments) {
          // Arabic like every other user-facing message (see
          // `shared/core/errors/error-messages.ar.ts`). `validation-messages.ar.ts`
          // also maps the `isStrongPassword` constraint key, so this text only
          // shows if the constraint is read outside the global pipe.
          return 'كلمة المرور يجب أن تتكوّن من 8 إلى 64 حرفًا وتشمل حرفًا كبيرًا وحرفًا صغيرًا ورقمًا ورمزًا.';
        },
      },
    });
  };
}
