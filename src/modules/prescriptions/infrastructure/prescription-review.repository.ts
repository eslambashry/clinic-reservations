import { Injectable } from '@nestjs/common';
import { Prisma, PrescriptionReview, PrescriptionReviewDecision } from '@prisma/client';

export interface NewPrescriptionReview {
  prescriptionId: string;
  pharmacistUserId: string;
  decision: PrescriptionReviewDecision;
  reasonCode?: string;
  controlledSubstanceConfirmed: boolean;
}

@Injectable()
export class PrescriptionReviewRepository {
  /** Reviews are an append-only audit trail — never updated, only created. */
  create(db: Prisma.TransactionClient, input: NewPrescriptionReview): Promise<PrescriptionReview> {
    return db.prescriptionReview.create({
      data: {
        prescription_id: input.prescriptionId,
        pharmacist_user_id: input.pharmacistUserId,
        decision: input.decision,
        reason_code: input.reasonCode,
        controlled_substance_confirmed: input.controlledSubstanceConfirmed,
      },
    });
  }

  findByPrescriptionId(db: Prisma.TransactionClient, prescriptionId: string): Promise<PrescriptionReview[]> {
    return db.prescriptionReview.findMany({ where: { prescription_id: prescriptionId }, orderBy: { reviewed_at: 'asc' } });
  }
}
