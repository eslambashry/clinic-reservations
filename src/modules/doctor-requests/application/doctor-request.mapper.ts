import { DoctorRequest } from '@prisma/client';
import { DoctorRequestWithPatient } from '../infrastructure/doctor-request.repository';

export interface MyDoctorRequest {
  id: string;
  doctorName: string | null;
  clinicName: string | null;
  location: string | null;
  specialty: string | null;
  contactPhone: string | null;
  notes: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDoctorRequest extends MyDoctorRequest {
  patientId: string;
  patientName: string;
  patientPhone: string;
}

export function toMyDoctorRequest(row: DoctorRequest): MyDoctorRequest {
  return {
    id: row.id,
    doctorName: row.doctor_name,
    clinicName: row.clinic_name,
    location: row.location,
    specialty: row.specialty,
    contactPhone: row.contact_phone,
    notes: row.notes,
    status: row.status,
    adminNote: row.admin_note,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function patientDisplayName(patient: { first_name: string | null; last_name: string | null }): string {
  return [patient.first_name, patient.last_name].filter((part) => part && part.trim() !== '').join(' ').trim();
}

export function toAdminDoctorRequest(row: DoctorRequestWithPatient): AdminDoctorRequest {
  return {
    ...toMyDoctorRequest(row),
    patientId: row.patient_id,
    patientName: patientDisplayName(row.patient),
    patientPhone: row.patient.phone,
  };
}
