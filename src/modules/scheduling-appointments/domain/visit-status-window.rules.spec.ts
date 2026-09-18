import {
  VISIT_STATUS_EARLY_ARRIVAL_WINDOW_MS,
  visitStatusWindowResult,
} from './visit-status-window.rules';

describe('visitStatusWindowResult', () => {
  const startAt = new Date('2026-09-22T15:00:00.000Z');
  const endAt = new Date('2026-09-22T15:30:00.000Z');

  it('allows the named 30-minute arrival window through the scheduled end', () => {
    expect(
      visitStatusWindowResult(
        startAt,
        endAt,
        new Date(startAt.getTime() - VISIT_STATUS_EARLY_ARRIVAL_WINDOW_MS),
      ),
    ).toBe('ELIGIBLE');
    expect(visitStatusWindowResult(startAt, endAt, endAt)).toBe('ELIGIBLE');
  });

  it('rejects changes before the arrival window and after the appointment window', () => {
    expect(
      visitStatusWindowResult(
        startAt,
        endAt,
        new Date(startAt.getTime() - VISIT_STATUS_EARLY_ARRIVAL_WINDOW_MS - 1),
      ),
    ).toBe('TOO_EARLY');
    expect(
      visitStatusWindowResult(startAt, endAt, new Date(endAt.getTime() + 1)),
    ).toBe('OUTSIDE_WINDOW');
  });
});
