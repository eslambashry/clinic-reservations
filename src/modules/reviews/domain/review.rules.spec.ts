import { isReviewableAppointmentStatus, publicPatientName, summarizeRatings } from './review.rules';

describe('review rules', () => {
  it('only COMPLETED appointments are reviewable', () => {
    expect(isReviewableAppointmentStatus('COMPLETED')).toBe(true);
    for (const status of ['HELD', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED', 'EXPIRED'] as const) {
      expect(isReviewableAppointmentStatus(status)).toBe(false);
    }
  });

  it('summarizes an empty histogram as 0 / 0', () => {
    expect(summarizeRatings({})).toEqual({ avg: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  });

  it('averages to one decimal and fills the distribution', () => {
    // (5*2 + 4*1 + 1*1) / 4 = 3.75 -> 3.8
    const result = summarizeRatings({ 5: 2, 4: 1, 1: 1 });
    expect(result.count).toBe(4);
    expect(result.avg).toBe(3.8);
    expect(result.distribution).toEqual({ 1: 1, 2: 0, 3: 0, 4: 1, 5: 2 });
  });

  it('shows the first name only, with a fallback', () => {
    expect(publicPatientName(' Mona ')).toBe('Mona');
    expect(publicPatientName(null)).toBe('مريض');
  });
});
