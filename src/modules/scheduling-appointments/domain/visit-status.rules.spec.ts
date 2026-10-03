import {
  canChangeBooking,
  isBeforeAppointmentStart,
  isOnAppointmentLocalDay,
  isValidVisitStatusTransition,
  isVisitTransitionAllowedAt,
  nextVisitStatus,
} from './visit-status.rules';

describe('visit status progression', () => {
  it('allows only WAITING -> IN_DOCTOR_ROOM -> LEFT', () => {
    expect(nextVisitStatus('WAITING')).toBe('IN_DOCTOR_ROOM');
    expect(nextVisitStatus('IN_DOCTOR_ROOM')).toBe('LEFT');
    expect(nextVisitStatus('LEFT')).toBeNull();
  });

  it.each([
    ['WAITING', 'WAITING'],
    ['WAITING', 'LEFT'],
    ['IN_DOCTOR_ROOM', 'WAITING'],
    ['IN_DOCTOR_ROOM', 'IN_DOCTOR_ROOM'],
    ['LEFT', 'WAITING'],
    ['LEFT', 'IN_DOCTOR_ROOM'],
    ['LEFT', 'LEFT'],
  ] as const)('rejects %s -> %s', (current, target) => {
    expect(isValidVisitStatusTransition(current, target)).toBe(false);
  });
});

describe('booking changes (PM-APPT-01/02)', () => {
  it('allows cancelling or rescheduling only while the patient is still WAITING', () => {
    expect(canChangeBooking('WAITING')).toBe(true);
    expect(canChangeBooking('IN_DOCTOR_ROOM')).toBe(false);
    expect(canChangeBooking('LEFT')).toBe(false);
    expect(canChangeBooking('TIME_EXPIRED')).toBe(false);
    expect(canChangeBooking('CANCELLED')).toBe(false);
  });

  it('treats start_at itself as already started (now < start_at only)', () => {
    const start = new Date('2026-10-03T09:00:00.000Z');
    expect(isBeforeAppointmentStart(start, new Date('2026-10-03T08:59:59.999Z'))).toBe(true);
    expect(isBeforeAppointmentStart(start, new Date('2026-10-03T09:00:00.000Z'))).toBe(false);
    expect(isBeforeAppointmentStart(start, new Date('2026-10-03T09:00:00.001Z'))).toBe(false);
  });
});

describe('visit-status day window in the branch zone (PM-APPT-03)', () => {
  const CAIRO = 'Africa/Cairo';
  const at = (iso: string) => new Date(iso);

  describe('Egyptian summer time (UTC+3)', () => {
    // 23:30 local on 15 July = 20:30Z.
    const lateStart = at('2026-07-15T20:30:00Z');

    it('starts a visit before local midnight on the appointment day', () => {
      expect(isVisitTransitionAllowedAt('IN_DOCTOR_ROOM', lateStart, at('2026-07-15T20:59:00Z'), CAIRO)).toBe(true); // 23:59 local
    });

    it('refuses to start it once the local day has rolled over', () => {
      expect(isVisitTransitionAllowedAt('IN_DOCTOR_ROOM', lateStart, at('2026-07-15T21:00:00Z'), CAIRO)).toBe(false); // 00:00 next day
    });

    it('lets the active visit reach LEFT after midnight (23:30 start, 00:15 finish)', () => {
      expect(isVisitTransitionAllowedAt('LEFT', lateStart, at('2026-07-15T21:15:00Z'), CAIRO)).toBe(true);
    });

    it('uses the local calendar day, not the UTC date', () => {
      // 00:30 local on 16 July = 21:30Z on 15 July.
      const earlyStart = at('2026-07-15T21:30:00Z');
      expect(isOnAppointmentLocalDay(earlyStart, at('2026-07-15T21:10:00Z'), CAIRO)).toBe(true); // 00:10 local 16 July
      expect(isOnAppointmentLocalDay(earlyStart, at('2026-07-15T20:50:00Z'), CAIRO)).toBe(false); // 23:50 local 15 July
    });
  });

  describe('Egyptian winter time (UTC+2)', () => {
    // 23:30 local on 15 January = 21:30Z.
    const lateStart = at('2026-01-15T21:30:00Z');

    it('allows 23:59 local and refuses 00:00 local for starting the visit', () => {
      expect(isVisitTransitionAllowedAt('IN_DOCTOR_ROOM', lateStart, at('2026-01-15T21:59:00Z'), CAIRO)).toBe(true);
      expect(isVisitTransitionAllowedAt('IN_DOCTOR_ROOM', lateStart, at('2026-01-15T22:00:00Z'), CAIRO)).toBe(false);
    });

    it('lets the active visit reach LEFT after midnight', () => {
      expect(isVisitTransitionAllowedAt('LEFT', lateStart, at('2026-01-15T22:15:00Z'), CAIRO)).toBe(true);
    });

    it('would be wrong with the summer offset: 21:30Z is still 23:30 on the 15th in winter', () => {
      expect(isOnAppointmentLocalDay(lateStart, at('2026-01-15T21:45:00Z'), CAIRO)).toBe(true);
    });
  });

  it('refuses to start a visit on a future day or an old past day', () => {
    const start = at('2026-10-10T07:00:00Z');
    expect(isVisitTransitionAllowedAt('IN_DOCTOR_ROOM', start, at('2026-10-09T07:00:00Z'), CAIRO)).toBe(false);
    expect(isVisitTransitionAllowedAt('IN_DOCTOR_ROOM', start, at('2026-10-12T07:00:00Z'), CAIRO)).toBe(false);
  });

  it('applies the branch zone it is given, not Cairo by default', () => {
    // Start 21:00Z = 22:00 on 3 Oct in London (BST) but 00:00 on 4 Oct in Riyadh (UTC+3),
    // so the same instants fall on different local days per zone.
    const start = at('2026-10-03T21:00:00Z');
    expect(isOnAppointmentLocalDay(start, at('2026-10-03T22:30:00Z'), 'Europe/London')).toBe(true);
    expect(isOnAppointmentLocalDay(start, at('2026-10-03T22:30:00Z'), 'Asia/Riyadh')).toBe(true);
    expect(isOnAppointmentLocalDay(start, at('2026-10-03T20:30:00Z'), 'Asia/Riyadh')).toBe(false);
  });

  it('fails closed for an unknown zone', () => {
    const start = at('2026-10-03T07:00:00Z');
    expect(isVisitTransitionAllowedAt('IN_DOCTOR_ROOM', start, start, 'Mars/Olympus_Mons')).toBe(false);
  });
});

