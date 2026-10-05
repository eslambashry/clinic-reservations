import { Inject, Injectable } from '@nestjs/common';
import { Prescription, Prisma } from '@prisma/client';
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
  notes: string | null;
  images: { id: string; fileUrl: string; qualityCheckStatus: string }[];
  items: { id: string; drugCode: string | null; drugNameFreeText: string | null; dose: string | null; frequency: string | null }[];
  reviews: { id: string; decision: string; reasonCode: string | null; reviewedAt: string }[];
}

/**
 * `GET /v1/prescriptions/{id}` — owning patient or ADMIN only. Approved
 * PM-SEC-01 restricts pharmacy staff reads/reviews to authorized branch orders
 * through pharmacy-fulfillment; executeForOrder is that module's internal seam.
 * File 12 Part 37.6 still flags the missing mandatory-reason-code Admin-read
 * audit variant. Unauthorized global reads return 404 to hide existence.
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
    const isOwner = actor.contextType === 'PATIENT' && prescription?.patient_id === actor.sub;
    const isStaff = actor.contextType === 'ADMIN';

    if (!prescription || (!isOwner && !isStaff)) {
      throw new NotFoundError('Prescription', prescriptionId);
    }
    if (prescription.status === 'PENDING_DOCTOR_APPROVAL' && actor.contextType !== 'ADMIN') {
      throw new NotFoundError('Prescription', prescriptionId);
    }

    return this.detail(this.prisma, prescription);
  }

  /** Internal seam: pharmacy-fulfillment must authorize and lock the linked order first. */
  async executeForOrder(db: Prisma.TransactionClient, prescriptionId: string): Promise<PrescriptionDetail> {
    const prescription = await this.prescriptions.findById(db, prescriptionId);
    if (!prescription || prescription.status === 'PENDING_DOCTOR_APPROVAL' || prescription.document_type !== 'PRESCRIPTION') {
      throw new NotFoundError('Prescription', prescriptionId);
    }
    return this.detail(db, prescription);
  }

  private async detail(db: Prisma.TransactionClient, prescription: Prescription): Promise<PrescriptionDetail> {
    const prescriptionId = prescription.id;

    const [images, items, reviews] = await Promise.all([
      this.images.findByPrescriptionId(db, prescriptionId),
      this.items.findByPrescriptionId(db, prescriptionId),
      this.reviews.findByPrescriptionId(db, prescriptionId),
    ]);

    return {
      prescriptionId: prescription.id,
      status: prescription.status,
      source: prescription.source,
      notes: prescription.notes,
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
