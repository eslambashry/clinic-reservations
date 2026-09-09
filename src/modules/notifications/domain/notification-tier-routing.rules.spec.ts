import { isUserDisableable, isWithinQuietHours, respectsQuietHours } from './notification-tier-routing.rules';

describe('notification-tier-routing.rules', () => {
  describe('isUserDisableable / respectsQuietHours', () => {
    it('SAFETY_CRITICAL is never user-disableable and never respects quiet hours', () => {
      expect(isUserDisableable('SAFETY_CRITICAL')).toBe(false);
      expect(respectsQuietHours('SAFETY_CRITICAL')).toBe(false);
    });

    it.each(['TRANSACTIONAL', 'INFORMATIONAL', 'MARKETING'] as const)('%s is user-disableable and respects quiet hours', (tier) => {
      expect(isUserDisableable(tier)).toBe(true);
      expect(respectsQuietHours(tier)).toBe(true);
    });
  });

  describe('isWithinQuietHours', () => {
    it('returns false when start equals end (quiet hours effectively off)', () => {
      expect(isWithinQuietHours(3, { startHour: 22, endHour: 22 })).toBe(false);
    });

    it('handles a same-day window (e.g. 13-15) without wrapping midnight', () => {
      const window = { startHour: 13, endHour: 15 };
      expect(isWithinQuietHours(12, window)).toBe(false);
      expect(isWithinQuietHours(13, window)).toBe(true);
      expect(isWithinQuietHours(14, window)).toBe(true);
      expect(isWithinQuietHours(15, window)).toBe(false);
    });

    it('handles an overnight-wrapping window (22-8)', () => {
      const window = { startHour: 22, endHour: 8 };
      expect(isWithinQuietHours(23, window)).toBe(true);
      expect(isWithinQuietHours(3, window)).toBe(true);
      expect(isWithinQuietHours(7, window)).toBe(true);
      expect(isWithinQuietHours(8, window)).toBe(false);
      expect(isWithinQuietHours(21, window)).toBe(false);
      expect(isWithinQuietHours(12, window)).toBe(false);
    });
  });
});
