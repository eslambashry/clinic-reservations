import { Injectable } from '@nestjs/common';
import { DoctorRequest, DoctorRequestStatus, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

const WITH_PATIENT = { patient: { select: { first_name: true, last_name: true, phone: true } } } satisfies Prisma.DoctorRequestInclude;
export type DoctorRequestWithPatient = Prisma.DoctorRequestGetPayload<{ include: typeof WITH_PATIENT }>;

@Injectable()
export class DoctorRequestRepository {
  create(
    db: Prisma.TransactionClient,
    input: {
      patientId: string;
      doctorName: string | null;
      clinicName: string | null;
      location: string | null;
      specialty: string | null;
      contactPhone: string | null;
      notes: string | null;
    },
  ): Promise<DoctorRequest> {
    return db.doctorRequest.create({
      data: {
        patient_id: input.patientId,
        doctor_name: input.doctorName,
        clinic_name: input.clinicName,
        location: input.location,
        specialty: input.specialty,
        contact_phone: input.contactPhone,
        notes: input.notes,
      },
    });
  }

  countOpenForPatient(db: Prisma.TransactionClient, patientId: string): Promise<number> {
    return db.doctorRequest.count({ where: { patient_id: patientId, status: { in: ['PENDING', 'IN_REVIEW'] } } });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<DoctorRequest | null> {
    return db.doctorRequest.findUnique({ where: { id } });
  }

  findByIdWithPatient(db: Prisma.TransactionClient, id: string): Promise<DoctorRequestWithPatient | null> {
    return db.doctorRequest.findUnique({ where: { id }, include: WITH_PATIENT });
  }

  listForPatient(db: Prisma.TransactionClient, patientId: string, take: number): Promise<DoctorRequest[]> {
    return db.doctorRequest.findMany({ where: { patient_id: patientId }, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], take });
  }

  async listForAdmin(
    db: Prisma.TransactionClient,
    params: { status?: DoctorRequestStatus; skip: number; take: number },
  ): Promise<{ rows: DoctorRequestWithPatient[]; total: number }> {
    const where: Prisma.DoctorRequestWhereInput = { ...(params.status && { status: params.status }) };
    const [rows, total] = await Promise.all([
      db.doctorRequest.findMany({ where, include: WITH_PATIENT, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: params.skip, take: params.take }),
      db.doctorRequest.count({ where }),
    ]);
    return { rows, total };
  }

  async setStatus(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    status: DoctorRequestStatus,
    adminNote: string | null | undefined,
  ): Promise<void> {
    await updateWithOptimisticLock(db.doctorRequest, id, currentVersion, {
      status,
      ...(adminNote !== undefined && { admin_note: adminNote }),
    });
  }
}
