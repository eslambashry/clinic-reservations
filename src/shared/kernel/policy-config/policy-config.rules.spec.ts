import { BusinessRuleError, DomainError } from '../../core/errors/domain-errors';
import { parsePolicyType, validatePolicyValue } from './policy-config.rules';

describe('validatePolicyValue', () => {
  const invalid = (type: any, value: unknown) => {
    try {
      validatePolicyValue(type, value);
    } catch (e) {
      return e as BusinessRuleError;
    }
    throw new Error('expected validation to fail');
  };

  it.each([null, 'str', 5, [1], undefined])('rejects non-object value %p', (value) => {
    const e = invalid('COMMISSION_RATE', value);
    expect(e).toBeInstanceOf(BusinessRuleError);
    expect(e.code).toBe('POLICY_VALUE_INVALID');
  });

  it('accepts commission rate within 0..100 (inclusive)', () => {
    expect(validatePolicyValue('COMMISSION_RATE' as any, { ratePercent: 0 })).toEqual({ ratePercent: 0 });
    expect(validatePolicyValue('COMMISSION_RATE' as any, { ratePercent: 12.5 })).toEqual({ ratePercent: 12.5 });
    expect(validatePolicyValue('COMMISSION_RATE' as any, { ratePercent: 100 })).toEqual({ ratePercent: 100 });
  });

  it('rejects unexpected keys, naming them', () => {
    const e = invalid('COMMISSION_RATE', { ratePercent: 5, typo: 1 });
    expect(e.message).toContain('typo');
  });

  it('rejects non-numeric, NaN/Infinity and out-of-range numbers', () => {
    expect(invalid('COMMISSION_RATE', { ratePercent: '5' }).message).toContain('ratePercent');
    expect(invalid('COMMISSION_RATE', {}).message).toContain('رقمًا');
    expect(invalid('COMMISSION_RATE', { ratePercent: Infinity }).code).toBe('POLICY_VALUE_INVALID');
    expect(invalid('COMMISSION_RATE', { ratePercent: NaN }).code).toBe('POLICY_VALUE_INVALID');
    expect(invalid('COMMISSION_RATE', { ratePercent: -1 }).message).toContain('بين 0 و100');
    expect(invalid('COMMISSION_RATE', { ratePercent: 101 }).message).toContain('بين 0 و100');
  });

  it('validates cancellation tier', () => {
    expect(validatePolicyValue('CANCELLATION_TIER' as any, { feePercent: 30 })).toEqual({ feePercent: 30 });
    expect(invalid('CANCELLATION_TIER', { feePercent: 101 }).code).toBe('POLICY_VALUE_INVALID');
    expect(invalid('CANCELLATION_TIER', { ratePercent: 1 }).code).toBe('POLICY_VALUE_INVALID');
  });

  it('validates quiet hours (integers 0..23, wrap-around allowed)', () => {
    expect(validatePolicyValue('NOTIFICATION_QUIET_HOURS' as any, { startHour: 22, endHour: 8 })).toEqual({ startHour: 22, endHour: 8 });
    expect(invalid('NOTIFICATION_QUIET_HOURS', { startHour: 1.5, endHour: 8 }).message).toContain('صحيحًا');
    expect(invalid('NOTIFICATION_QUIET_HOURS', { startHour: 1, endHour: 24 }).message).toContain('بين 0 و23');
    expect(invalid('NOTIFICATION_QUIET_HOURS', { startHour: 1 }).code).toBe('POLICY_VALUE_INVALID');
  });

  it('validates min appointment payment as a positive decimal string', () => {
    expect(validatePolicyValue('MIN_APPOINTMENT_PAYMENT' as any, { minAmount: '50.00' })).toEqual({ minAmount: '50.00' });
    expect(validatePolicyValue('MIN_APPOINTMENT_PAYMENT' as any, { minAmount: '50' })).toEqual({ minAmount: '50' });
    for (const bad of [50, '0', '0.00', '-5', '5.123', 'abc', '']) {
      expect(invalid('MIN_APPOINTMENT_PAYMENT', { minAmount: bad }).code).toBe('POLICY_VALUE_INVALID');
    }
  });
});

describe('parsePolicyType', () => {
  it('returns known policy types', () => {
    expect(parsePolicyType('COMMISSION_RATE')).toBe('COMMISSION_RATE');
  });

  it('throws a 400 DomainError for unknown types', () => {
    try {
      parsePolicyType('NOPE');
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(DomainError);
      expect(e.code).toBe('POLICY_TYPE_INVALID');
      expect(e.httpStatus).toBe(400);
    }
  });
});
