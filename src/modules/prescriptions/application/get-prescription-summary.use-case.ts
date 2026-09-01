import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MEDIA_CONSTANTS } from '../../../shared/config/constants';
import { MEDIA_STORAGE, MediaStoragePort } from '../../../shared/kernel/storage/media-storage.port';
import { PrescriptionImageRepository } from '../infrastructure/prescription-image.repository';
import { PrescriptionRepository } from '../infrastructure/prescription.repository';

export interface PrescriptionSummary {
  id: string;
  source: string;
  status: string;
  expiresAt: string | null;
  doctorId: string | null;
  images: { id: string; fileUrl: string; qualityCheckStatus: string }[];
}

/**
 * 2026-08-29 addition — `pharmacy-fulfillment`'s `GetPharmacyOrderUseCase`
 * needs the prescription's own fields (source/status/expiry/doctor/images)
 * for its order-detail response, and `GetPrescriptionUseCase` is the wrong
 * tool: it's HTTP-shaped (does its own owner/staff authorization, no `tx`).
 * Plain tx-scoped lookup, no ownership check — the caller already
 * legitimately owns this prescription via its own `PharmacyOrder` row, same
 * shape as `GetAcceptedPrescriptionForOrderUseCase` minus the ACCEPTED-only
 * gate (an order's prescription can be read regardless of its current
 * status once the order itself exists).
 */
@Injectable()
export class GetPrescriptionSummaryUseCase {
  constructor(
    @Inject(PrescriptionRepository) private readonly prescriptions: PrescriptionRepository,
    @Inject(PrescriptionImageRepository) private readonly images: PrescriptionImageRepository,
    @Inject(MEDIA_STORAGE) private readonly mediaStorage: MediaStoragePort,
  ) {}

  async execute(tx: Prisma.TransactionClient, prescriptionId: string): Promise<PrescriptionSummary | null> {
    const prescription = await this.prescriptions.findById(tx, prescriptionId);
    if (!prescription) {
      return null;
    }
    const images = await this.images.findByPrescriptionId(tx, prescriptionId);
    return {
      id: prescription.id,
      source: prescription.source,
      status: prescription.status,
      expiresAt: prescription.expires_at?.toISOString() ?? null,
      doctorId: prescription.doctor_id,
      // Signed fresh on every read — see the identical note in `GetPrescriptionUseCase`.
      images: images.map((image) => ({
        id: image.id,
        fileUrl: this.mediaStorage.getSignedUrl(image.file_url, MEDIA_CONSTANTS.SIGNED_URL_TTL_SECONDS),
        qualityCheckStatus: image.quality_check_status,
      })),
    };
  }
}
