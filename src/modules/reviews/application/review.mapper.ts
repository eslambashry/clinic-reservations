import { Review } from '@prisma/client';
import { publicPatientName } from '../domain/review.rules';
import { ReviewWithPatient } from '../infrastructure/review.repository';

export interface ReviewItem {
  id: string;
  rating: number;
  comment: string | null;
  patientName: string;
  createdAt: string;
}

export interface AdminReviewItem extends ReviewItem {
  doctorId: string;
  appointmentId: string;
  status: string;
  patientFullName: string;
}

export interface MyReview {
  id: string;
  appointmentId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export function toReviewItem(row: ReviewWithPatient): ReviewItem {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    patientName: publicPatientName(row.patient.first_name),
    createdAt: row.created_at.toISOString(),
  };
}

export function toAdminReviewItem(row: ReviewWithPatient): AdminReviewItem {
  return {
    ...toReviewItem(row),
    doctorId: row.subject_id,
    appointmentId: row.appointment_id,
    status: row.status,
    patientFullName: [row.patient.first_name, row.patient.last_name].filter(Boolean).join(' ') || 'مريض',
  };
}

export function toMyReview(row: Review): MyReview {
  return { id: row.id, appointmentId: row.appointment_id, rating: row.rating, comment: row.comment, createdAt: row.created_at.toISOString() };
}
