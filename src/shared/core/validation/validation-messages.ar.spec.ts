import { ValidationError } from '@nestjs/common';
import { toArabicValidationMessages } from './validation-messages.ar';

const ve = (property: string, constraints: Record<string, string>, children: ValidationError[] = []): ValidationError =>
  ({ property, constraints, children }) as ValidationError;
const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

describe('toArabicValidationMessages', () => {
  it('translates every known constraint into Arabic using the field label', () => {
    const constraints = [
      'isDefined', 'isNotEmpty', 'isNotEmptyObject', 'isString', 'isNumber', 'isInt', 'isBoolean', 'isArray', 'isObject',
      'isDecimal', 'isNumberString', 'isUuid', 'isEmail', 'isUrl', 'isIso8601', 'isDateString', 'isDate', 'isLatitude',
      'isLongitude', 'isPhoneNumber', 'matches', 'isNotIn', 'isPositive', 'isNegative', 'arrayNotEmpty', 'arrayUnique',
      'isStrongPassword', 'whitelistValidation',
    ];
    for (const c of constraints) {
      const [msg] = toArabicValidationMessages([ve('phone', { [c]: 'english text' })]);
      expect(hasArabic(msg)).toBe(true);
      expect(msg).not.toContain('english');
    }
  });

  it('uses the Arabic label when mapped and the raw property otherwise', () => {
    expect(toArabicValidationMessages([ve('phone', { isString: 'x' })])[0]).toContain('رقم الهاتف');
    expect(toArabicValidationMessages([ve('unmappedField', { isString: 'x' })])[0]).toContain('unmappedField');
  });

  it('extracts numeric bounds from the English message', () => {
    expect(toArabicValidationMessages([ve('quantity', { min: 'quantity must not be less than 3' })])[0]).toContain('3');
    expect(toArabicValidationMessages([ve('quantity', { max: 'quantity must not be greater than 9.5' })])[0]).toContain('9.5');
    expect(toArabicValidationMessages([ve('code', { minLength: 'code must be longer than or equal to 4 characters' })])[0]).toContain('4');
    expect(toArabicValidationMessages([ve('code', { maxLength: 'code must be shorter than or equal to 8 characters' })])[0]).toContain('8');
    expect(toArabicValidationMessages([ve('items', { arrayMinSize: 'items must contain at least 2 elements' })])[0]).toContain('2');
    expect(toArabicValidationMessages([ve('items', { arrayMaxSize: 'items must contain no more than 5 elements' })])[0]).toContain('5');
  });

  it('handles isLength as a range or an exact length', () => {
    expect(toArabicValidationMessages([ve('code', { isLength: 'code must be longer than or equal to 4 and shorter than or equal to 8 characters' })])[0]).toContain('بين 4 و8');
    expect(toArabicValidationMessages([ve('code', { isLength: 'code must be longer than or equal to 6 and shorter than or equal to 6 characters' })])[0]).toContain('يتكوّن من 6');
    expect(toArabicValidationMessages([ve('code', { isLength: 'code length is wrong' })])[0]).toContain('يتكوّن من');
  });

  it('lists enum/in options when short and omits them when too many or absent', () => {
    expect(toArabicValidationMessages([ve('status', { isEnum: 'status must be one of the following values: A, B, C' })])[0]).toContain('A، B، C');
    expect(toArabicValidationMessages([ve('status', { isIn: 'status must be one of the following values: A, B' })])[0]).toContain('A، B');
    const many = Array.from({ length: 9 }, (_, i) => `V${i}`).join(', ');
    expect(toArabicValidationMessages([ve('status', { isEnum: `status must be one of the following values: ${many}` })])[0]).not.toContain('V0');
    expect(toArabicValidationMessages([ve('status', { isEnum: 'no options here' })])[0]).not.toContain(':');
  });

  it('matches constraint keys case-insensitively as a fallback', () => {
    expect(hasArabic(toArabicValidationMessages([ve('phone', { ISSTRING: 'x' })])[0])).toBe(true);
  });

  it('keeps unknown-constraint messages that are already Arabic, else uses a generic Arabic line', () => {
    expect(toArabicValidationMessages([ve('phone', { custom: 'رسالة مخصصة' })])).toEqual(['رسالة مخصصة']);
    expect(toArabicValidationMessages([ve('phone', { custom: 'english only' })])).toEqual(['رقم الهاتف بصيغة غير صحيحة.']);
  });

  it('recurses into children and deduplicates', () => {
    const child = ve('quantity', { isInt: 'x' });
    const parent = ve('items', {}, [child, child]);
    const out = toArabicValidationMessages([parent, { property: 'noConstraints' } as ValidationError]);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('الكمية');
  });
});
