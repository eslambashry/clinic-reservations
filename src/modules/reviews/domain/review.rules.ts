import { AppointmentStatus } from '@prisma/client';

export const REVIEW_STATUS = { PUBLISHED: 'PUBLISHED', HIDDEN: 'HIDDEN' } as const;
export type ReviewStatus = (typeof REVIEW_STATUS)[keyof typeof REVIEW_STATUS];

/** A visit can be rated only once it has actually happened (visit `LEFT` completes the appointment). */
export function isReviewableAppointmentStatus(status: AppointmentStatus): boolean {
  return status === 'COMPLETED';
}

export interface RatingAggregate {
  avg: number;
  count: number;
}

/** 1..5 star histogram + the one-decimal average stored on `doctors.rating_avg` (Decimal(2,1)). */
export function summarizeRatings(countsByRating: Record<number, number>): RatingAggregate & { distribution: Record<1 | 2 | 3 | 4 | 5, number> } {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  let count = 0;
  let sum = 0;
  for (const star of [1, 2, 3, 4, 5] as const) {
    const n = countsByRating[star] ?? 0;
    distribution[star] = n;
    count += n;
    sum += n * star;
  }
  return { avg: count === 0 ? 0 : Math.round((sum / count) * 10) / 10, count, distribution };
}

/** Public display name: first name only (privacy). */
export function publicPatientName(firstName: string | null): string {
  return firstName?.trim() || 'مريض';
}
