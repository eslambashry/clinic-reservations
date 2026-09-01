import { Inject, Injectable } from '@nestjs/common';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { MEDIA_CONSTANTS } from '../../../shared/config/constants';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { MEDIA_STORAGE, MediaStoragePort } from '../../../shared/kernel/storage/media-storage.port';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PrescriptionImageRepository } from '../infrastructure/prescription-image.repository';
import { PrescriptionItemRepository } from '../infrastructure/prescription-item.repository';
import { PrescriptionRepository } from '../infrastructure/prescription.repository';
import { PrescriptionReviewRepository } from '../infrastructure/prescription-review.repository';

export interface PrescriptionDetail {
  prescriptionId: string;
  status: string;
  source: string;
  images: { id: string; fileUrl: string; qualityCheckStatus: string }[];
  items: { id: string; drugCode: string | null; drugNameFreeText: string | null; dose: string | null; frequency: string | null }[];
  reviews: { id: string; decision: string; reasonCode: string | null; reviewedAt: string }[];
}

/**
 * File 11 05.7 `GET /v1/prescriptions/{id}` — owning patient, `PHARMACY_STAFF`,
 * or `ADMIN`. File 12 Part 37.4/37.6: no branch-scoping for pharmacy staff
 * yet (Phase 7 dependency), and no mandatory-reason-code Admin-read audit
 * variant exists — both flagged gaps, not silently built. 404 hides
 * existence from anyone not entitled to see this prescription at all
 * (a patient who isn't the owner), same pattern as every other detail
 * endpoint in this codebase.
 */
@Injectable()
export class GetPrescriptionUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PrescriptionRepository) private readonly prescriptions: PrescriptionRepository,
    @Inject(PrescriptionImageRepository) private readonly images: PrescriptionImageRepository,
    @Inject(PrescriptionItemRepository) private readonly items: PrescriptionItemRepository,
    @Inject(PrescriptionReviewRepository) private readonly reviews: PrescriptionReviewRepository,
    @Inject(MEDIA_STORAGE) private readonly mediaStorage: MediaStoragePort,
  ) {}

  async execute(prescriptionId: string, actor: AccessTokenPayload): Promise<PrescriptionDetail> {
    const prescription = await this.prescriptions.findById(this.prisma, prescriptionId);
    const isOwner = prescription?.patient_id === actor.sub;
    const isStaff = actor.contextType === 'PHARMACY_STAFF' || actor.contextType === 'ADMIN';

    if (!prescription || (!isOwner && !isStaff)) {
      throw new NotFoundError('Prescription', prescriptionId);
    }

    const [images, items, reviews] = await Promise.all([
      this.images.findByPrescriptionId(this.prisma, prescriptionId),
      this.items.findByPrescriptionId(this.prisma, prescriptionId),
      this.reviews.findByPrescriptionId(this.prisma, prescriptionId),
    ]);

    return {
      prescriptionId: prescription.id,
      status: prescription.status,
      source: prescription.source,
      // `file_url` is stored unsigned (uploaded `isPrivate: true` — File 11's PHI table requires restricted access, not a public link) — sign fresh on every read, never persist the signed form.
      images: images.map((image) => ({
        id: image.id,
        fileUrl: this.mediaStorage.getSignedUrl(image.file_url, MEDIA_CONSTANTS.SIGNED_URL_TTL_SECONDS),
        qualityCheckStatus: image.quality_check_status,
      })),
      items: items.map((item) => ({ id: item.id, drugCode: item.drug_code, drugNameFreeText: item.drug_name_free_text, dose: item.dose, frequency: item.frequency })),
      reviews: reviews.map((review) => ({ id: review.id, decision: review.decision, reasonCode: review.reason_code, reviewedAt: review.reviewed_at.toISOString() })),
    };
  }
}
