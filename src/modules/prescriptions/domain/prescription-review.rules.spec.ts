import { requiresControlledSubstanceConfirmation, resolvePrescriptionStatus } from './prescription-review.rules';

describe('requiresControlledSubstanceConfirmation', () => {
  it('returns false when no item is a controlled substance', () => {
    expect(
      requiresControlledSubstanceConfirmation([
        { drugCode: 'PARA500', isControlledSubstance: false },
        { drugCode: 'IBU200', isControlledSubstance: false },
      ]),
    ).toBe(false);
  });

  it('returns true when at least one confirmed item is a controlled substance', () => {
    expect(
      requiresControlledSubstanceConfirmation([
        { drugCode: 'PARA500', isControlledSubstance: false },
        { drugCode: 'TRAMADOL50', isControlledSubstance: true },
      ]),
    ).toBe(true);
  });

  it('returns false for an empty item list', () => {
    expect(requiresControlledSubstanceConfirmation([])).toBe(false);
  });
});

describe('resolvePrescriptionStatus', () => {
  it('moves to ACCEPTED on an ACCEPTED decision', () => {
    expect(resolvePrescriptionStatus('QUALITY_CHECK_PASSED', 'ACCEPTED')).toBe('ACCEPTED');
  });

  it('moves to REJECTED on a REJECTED decision', () => {
    expect(resolvePrescriptionStatus('QUALITY_CHECK_PASSED', 'REJECTED')).toBe('REJECTED');
  });

  it('leaves the status unchanged on a NEEDS_CLARIFICATION decision', () => {
    expect(resolvePrescriptionStatus('QUALITY_CHECK_PASSED', 'NEEDS_CLARIFICATION')).toBe('QUALITY_CHECK_PASSED');
  });
});
