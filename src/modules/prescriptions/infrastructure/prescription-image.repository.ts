import { Injectable } from '@nestjs/common';
import { Prisma, PrescriptionImage } from '@prisma/client';
import { QualityCheckResult } from '../application/ports/quality-checker.port';

export interface NewPrescriptionImage {
  prescriptionId: string;
  fileUrl: string;
  qualityCheck: QualityCheckResult;
}

@Injectable()
export class PrescriptionImageRepository {
  createMany(db: Prisma.TransactionClient, images: NewPrescriptionImage[]): Promise<Prisma.BatchPayload> {
    return db.prescriptionImage.createMany({
      data: images.map((image) => ({
        prescription_id: image.prescriptionId,
        file_url: image.fileUrl,
        quality_check_status: image.qualityCheck.passed ? 'PASSED' : 'FAILED',
        blur_score: image.qualityCheck.blurScore,
      })),
    });
  }

  findByPrescriptionId(db: Prisma.TransactionClient, prescriptionId: string): Promise<PrescriptionImage[]> {
    return db.prescriptionImage.findMany({ where: { prescription_id: prescriptionId } });
  }
}
