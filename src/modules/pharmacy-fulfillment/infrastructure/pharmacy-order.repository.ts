import { Injectable } from '@nestjs/common';
import { FulfillmentType, PharmacyOrder, Prisma } from '@prisma/client';

export interface NewPharmacyOrder {
  prescriptionId: string;
  patientId: string;
  fulfillmentType: FulfillmentType;
}

@Injectable()
export class PharmacyOrderRepository {
  create(db: Prisma.TransactionClient, input: NewPharmacyOrder): Promise<PharmacyOrder> {
    return db.pharmacyOrder.create({
      data: {
        prescription_id: input.prescriptionId,
        patient_id: input.patientId,
        fulfillment_type: input.fulfillmentType,
      },
    });
  }

  /** Most recent order for this prescription, if any — callers check its status against `isActiveOrderStatus`. */
  findLatestByPrescriptionId(db: Prisma.TransactionClient, prescriptionId: string): Promise<PharmacyOrder | null> {
    return db.pharmacyOrder.findFirst({
      where: { prescription_id: prescriptionId },
      orderBy: { created_at: 'desc' },
    });
  }
}
