import { generateSlotBoundaries, isoWeekdayOf } from './slot-generation.rules';

describe('generateSlotBoundaries', () => {
  it('spaces slots by duration+buffer and drops a trailing remainder shorter than one slot', () => {
    const boundaries = generateSlotBoundaries(
      { startTime: '09:00', endTime: '10:00', slotDurationMinutes: 20, bufferMinutes: 5 },
      '2026-01-15',
      'UTC',
    );

    // step = 25min: 09:00-09:20, 09:25-09:45, then 09:50+20=10:10 > windowEnd (10:00) — dropped.
    expect(boundaries).toEqual([
      { startAt: new Date('2026-01-15T09:00:00.000Z'), endAt: new Date('2026-01-15T09:20:00.000Z') },
      { startAt: new Date('2026-01-15T09:25:00.000Z'), endAt: new Date('2026-01-15T09:45:00.000Z') },
    ]);
  });

  it('produces exactly evenly-divisible slots with no buffer', () => {
    const boundaries = generateSlotBoundaries(
      { startTime: '09:00', endTime: '10:00', slotDurationMinutes: 30, bufferMinutes: 0 },
      '2026-01-15',
      'UTC',
    );

    expect(boundaries).toHaveLength(2);
    expect(boundaries[0]).toEqual({ startAt: new Date('2026-01-15T09:00:00.000Z'), endAt: new Date('2026-01-15T09:30:00.000Z') });
    expect(boundaries[1]).toEqual({ startAt: new Date('2026-01-15T09:30:00.000Z'), endAt: new Date('2026-01-15T10:00:00.000Z') });
  });

  it('converts local wall-clock time to the correct UTC instant for a non-UTC timezone (Africa/Cairo, UTC+2 outside DST)', () => {
    const boundaries = generateSlotBoundaries(
      { startTime: '09:00', endTime: '09:20', slotDurationMinutes: 20, bufferMinutes: 0 },
      '2026-01-15',
      'Africa/Cairo',
    );

    expect(boundaries).toEqual([{ startAt: new Date('2026-01-15T07:00:00.000Z'), endAt: new Date('2026-01-15T07:20:00.000Z') }]);
  });

  it('returns no slots when endTime does not leave room for a full slot', () => {
    const boundaries = generateSlotBoundaries(
      { startTime: '09:00', endTime: '09:10', slotDurationMinutes: 20, bufferMinutes: 0 },
      '2026-01-15',
      'UTC',
    );

    expect(boundaries).toEqual([]);
  });

  it('returns no slots when endTime is not after startTime', () => {
    const boundaries = generateSlotBoundaries(
      { startTime: '10:00', endTime: '09:00', slotDurationMinutes: 20, bufferMinutes: 0 },
      '2026-01-15',
      'UTC',
    );

    expect(boundaries).toEqual([]);
  });
});

describe('isoWeekdayOf', () => {
  it('returns ISO-8601 weekday numbering (1=Monday)', () => {
    expect(isoWeekdayOf('2024-01-01', 'UTC')).toBe(1); // known Monday
    expect(isoWeekdayOf('2024-01-07', 'UTC')).toBe(7); // known Sunday
  });
});
