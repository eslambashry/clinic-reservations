import { DateTime } from 'luxon';

/**
 * File 11 Part 12 (availability/buffer time) + File 12 Part 33.4-33.7:
 * converts one `schedule_templates` row into concrete UTC slot boundaries
 * for one calendar date, in the branch's local timezone. Framework-free
 * (File 12 Part 05) aside from `luxon`, which is pure computation, not I/O —
 * no Prisma/HTTP imports, fully unit-testable without a database.
 *
 * A trailing remainder shorter than one full slot is dropped (Part 33.7).
 * Templates that don't fit within a single calendar day (`endTime` earlier
 * than `startTime`) aren't supported — schedule templates model same-day
 * shifts only, not overnight ones.
 */

export interface ScheduleTemplateWindow {
  startTime: string; // "HH:mm", 24-hour, local to the branch's timezone
  endTime: string; // "HH:mm"
  slotDurationMinutes: number;
  bufferMinutes: number;
}

export interface SlotBoundary {
  startAt: Date;
  endAt: Date;
}

/** `dateIso` is a plain calendar date, `"YYYY-MM-DD"`. */
export function generateSlotBoundaries(template: ScheduleTemplateWindow, dateIso: string, timezone: string): SlotBoundary[] {
  const windowStart = DateTime.fromISO(`${dateIso}T${template.startTime}`, { zone: timezone });
  const windowEnd = DateTime.fromISO(`${dateIso}T${template.endTime}`, { zone: timezone });

  if (!windowStart.isValid || !windowEnd.isValid || windowEnd <= windowStart) {
    return [];
  }

  const step = template.slotDurationMinutes + template.bufferMinutes;
  const boundaries: SlotBoundary[] = [];
  let cursor = windowStart;

  while (cursor.plus({ minutes: template.slotDurationMinutes }) <= windowEnd) {
    const slotEnd = cursor.plus({ minutes: template.slotDurationMinutes });
    boundaries.push({ startAt: cursor.toJSDate(), endAt: slotEnd.toJSDate() });
    cursor = cursor.plus({ minutes: step });
  }

  return boundaries;
}

/** ISO-8601 weekday (1=Monday…7=Sunday, Part 33.5) of a calendar date, evaluated in the branch's local timezone. */
export function isoWeekdayOf(dateIso: string, timezone: string): number {
  return DateTime.fromISO(dateIso, { zone: timezone }).weekday;
}

/** File 12 Part 33.6: a template window must fit within a single calendar day — `endTime` must be strictly after `startTime`. */
export function isValidScheduleWindow(startTime: string, endTime: string): boolean {
  return endTime > startTime;
}

/**
 * Two same-weekday windows on the same affiliation overlap (including an
 * exact duplicate) when one starts before the other ends and vice versa.
 * `"HH:mm"` strings compare correctly with plain `<`/`>=` since they're
 * fixed-width and zero-padded — no need to parse them into minutes.
 */
export function windowsOverlap(a: ScheduleTemplateWindow, b: ScheduleTemplateWindow): boolean {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}
