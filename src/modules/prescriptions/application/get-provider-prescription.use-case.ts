import { Inject, Injectable } from '@nestjs/common';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ResolveDoctorScopeUseCase } from '../../provider-directory/application/resolve-doctor-scope.use-case';
import { PrescriptionItemRepository } from '../infrastructure/prescription-item.repository';
import { PrescriptionImageRepository } from '../infrastructure/prescription-image.repository';
import { PrescriptionRepository } from '../infrastructure/prescription.repository';
import { MEDIA_STORAGE, MediaStoragePort } from '../../../shared/kernel/storage/media-storage.port';
import { MEDIA_CONSTANTS } from '../../../shared/config/constants';

@Injectable()
export class GetProviderPrescriptionUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PrescriptionRepository) private readonly prescriptions: PrescriptionRepository,
    @Inject(PrescriptionItemRepository) private readonly items: PrescriptionItemRepository,
    @Inject(PrescriptionImageRepository) private readonly images: PrescriptionImageRepository,
    @Inject(ResolveDoctorScopeUseCase) private readonly resolveDoctorScope: ResolveDoctorScopeUseCase,
    @Inject(MEDIA_STORAGE) private readonly mediaStorage: MediaStoragePort,
  ) {}

  async execute(prescriptionId: string, actor: AccessTokenPayload) {
    if (actor.contextType !== 'DOCTOR' && actor.contextType !== 'CLINIC_STAFF') {
      throw new NotFoundError('Prescription', prescriptionId);
    }
    const scope = await this.resolveDoctorScope.execute(actor);
    const prescription = await this.prescriptions.findById(this.prisma, prescriptionId);
    if (
      !prescription ||
      prescription.doctor_id !== scope.doctorUserId ||
      prescription.document_type !== 'PRESCRIPTION' ||
      (actor.contextType === 'CLINIC_STAFF' && prescription.created_by_user_id !== actor.sub)
    ) {
      throw new NotFoundError('Prescription', prescriptionId);
    }
    const [items, images] = await Promise.all([
      this.items.findByPrescriptionId(this.prisma, prescriptionId),
      this.images.findByPrescriptionId(this.prisma, prescriptionId),
    ]);
    return {
      id: prescription.id,
      patientId: prescription.patient_id,
      status: prescription.status,
      source: prescription.source,
      notes: prescription.notes,
      version: prescription.version,
      doctorId: prescription.doctor_id,
      createdByUserId: prescription.created_by_user_id,
      createdByRole: prescription.created_by_role,
      decidedByUserId: prescription.decided_by_user_id,
      appointmentId: prescription.appointment_id,
      approvedAt: prescription.approved_at?.toISOString() ?? null,
      rejectedAt: prescription.rejected_at?.toISOString() ?? null,
      rejectionReason: prescription.rejection_reason,
      items: items.map((item) => ({
        id: item.id,
        drugName: item.drug_name_free_text,
        dose: item.dose,
        frequency: item.frequency,
        durationDays: item.duration_days,
        quantity: item.quantity,
      })),
      images: images.map((image) => ({
        id: image.id,
        fileUrl: this.mediaStorage.getSignedUrl(image.file_url, MEDIA_CONSTANTS.SIGNED_URL_TTL_SECONDS),
        qualityCheckStatus: image.quality_check_status,
      })),
    };
  }
}
