import { Inject, Injectable } from '@nestjs/common';
import { PrescriptionReviewDecision } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { requiresControlledSubstanceConfirmation, resolvePrescriptionStatus } from '../domain/prescription-review.rules';
import { DrugCatalogRepository } from '../infrastructure/drug-catalog.repository';
import { PrescriptionItemRepository } from '../infrastructure/prescription-item.repository';
import { PrescriptionRepository } from '../infrastructure/prescription.repository';
import { PrescriptionReviewRepository } from '../infrastructure/prescription-review.repository';

export interface ItemCorrection {
  /** Omit to create a new item instead of correcting an existing one (File 12 Part 37.10). */
  prescriptionItemId?: string;
  drugCode: string;
  quantity: number;
}

export interface ReviewPrescriptionInput {
  decision: PrescriptionReviewDecision;
  reasonCode?: string;
  controlledSubstanceConfirmed?: boolean;
  itemCorrections?: ItemCorrection[];
}

export interface ReviewPrescriptionResult {
  status: string;
}

const OUTBOX_EVENT_BY_DECISION: Partial<Record<PrescriptionReviewDecision, string>> = {
  ACCEPTED: 'PrescriptionAccepted',
  REJECTED: 'PrescriptionRejected',
};

/**
 * File 11 05.7 `POST /v1/prescriptions/{id}/review` / File 12 Part 37.
 * Creates the `PrescriptionReview` row BEFORE applying any `itemCorrections`
 * — required ordering, not a style choice: the DB trigger on
 * `prescription_items` (migration `add_prescription_item_drug_code_review_trigger`)
 * rejects a non-null `drug_code` unless a review row for this prescription
 * already exists, and Postgres trigger visibility only sees the
 * transaction's own prior writes if they happened first.
 *
 * File 12 Part 37.10: an `itemCorrections` entry without a
 * `prescriptionItemId` creates a brand-new item instead of correcting one —
 * the `DEC-005` "manual pharmacist entry" path, since OCR (a no-op stub,
 * Part 37.2) never actually produces one to correct.
 */
@Injectable()
export class ReviewPrescriptionUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PrescriptionRepository) private readonly prescriptions: PrescriptionRepository,
    @Inject(PrescriptionItemRepository) private readonly items: PrescriptionItemRepository,
    @Inject(PrescriptionReviewRepository) private readonly reviews: PrescriptionReviewRepository,
    @Inject(DrugCatalogRepository) private readonly drugCatalog: DrugCatalogRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(prescriptionId: string, input: ReviewPrescriptionInput, actor: AccessTokenPayload): Promise<ReviewPrescriptionResult> {
    return this.prisma.$transaction(async (tx) => {
      const prescription = await this.prescriptions.findById(tx, prescriptionId);
      if (!prescription) {
        throw new NotFoundError('Prescription', prescriptionId);
      }

      const corrections = input.itemCorrections ?? [];
      if (corrections.length > 0) {
        const codes = [...new Set(corrections.map((c) => c.drugCode))];
        const drugs = await this.drugCatalog.findManyByCode(tx, codes);
        const controlledByCode = new Map(drugs.map((drug) => [drug.code, drug.controlled_substance]));

        const needsConfirmation = requiresControlledSubstanceConfirmation(
          corrections.map((c) => ({ drugCode: c.drugCode, isControlledSubstance: controlledByCode.get(c.drugCode) ?? false })),
        );
        if (needsConfirmation && !input.controlledSubstanceConfirmed) {
          throw new BusinessRuleError(
            'CONTROLLED_SUBSTANCE_CONFIRMATION_REQUIRED',
            'This prescription includes a controlled substance — controlledSubstanceConfirmed must be explicitly true to review it.',
          );
        }
      }

      // Must happen before any item correction below — see class doc comment.
      const review = await this.reviews.create(tx, {
        prescriptionId,
        pharmacistUserId: actor.sub,
        decision: input.decision,
        reasonCode: input.reasonCode,
        controlledSubstanceConfirmed: input.controlledSubstanceConfirmed ?? false,
      });

      for (const correction of corrections) {
        if (correction.prescriptionItemId) {
          const item = await this.items.findById(tx, correction.prescriptionItemId);
          if (!item || item.prescription_id !== prescriptionId) {
            throw new NotFoundError('PrescriptionItem', correction.prescriptionItemId);
          }
          await this.items.setDrugCodeAndQuantity(tx, item.id, item.version, { drugCode: correction.drugCode, quantity: correction.quantity });
        } else {
          await this.items.createReviewed(tx, prescriptionId, { drugCode: correction.drugCode, quantity: correction.quantity });
        }
      }

      const newStatus = resolvePrescriptionStatus(prescription.status, input.decision);
      if (newStatus !== prescription.status) {
        await this.prescriptions.setStatus(tx, prescription.id, prescription.version, newStatus);
      }

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'prescriptions.prescription.review',
        resourceType: 'prescription',
        resourceId: prescriptionId,
        reasonCode: input.reasonCode,
      });

      const eventName = OUTBOX_EVENT_BY_DECISION[input.decision];
      if (eventName) {
        await this.outbox.emit(tx, eventName, { prescriptionId, reviewId: review.id, decision: input.decision });
      }

      return { status: newStatus };
    });
  }
}
