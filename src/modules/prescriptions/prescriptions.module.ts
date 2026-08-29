import { Module } from '@nestjs/common';
import { PrescriptionsController } from './api/prescriptions.controller';
import { GetAcceptedPrescriptionForOrderUseCase } from './application/get-accepted-prescription-for-order.use-case';
import { GetDrugCatalogControlledStatusUseCase } from './application/get-drug-catalog-controlled-status.use-case';
import { GetPrescriptionItemDrugCodesUseCase } from './application/get-prescription-item-drug-codes.use-case';
import { GetPrescriptionUseCase } from './application/get-prescription.use-case';
import { ListPrescriptionsUseCase } from './application/list-prescriptions.use-case';
import { OCR_EXTRACTOR } from './application/ports/ocr-extractor.port';
import { QUALITY_CHECKER } from './application/ports/quality-checker.port';
import { ReviewPrescriptionUseCase } from './application/review-prescription.use-case';
import { UploadPrescriptionUseCase } from './application/upload-prescription.use-case';
import { DrugCatalogRepository } from './infrastructure/drug-catalog.repository';
import { NoOpOcrExtractor } from './infrastructure/no-op-ocr-extractor.service';
import { PassthroughQualityChecker } from './infrastructure/passthrough-quality-checker.service';
import { PrescriptionImageRepository } from './infrastructure/prescription-image.repository';
import { PrescriptionItemRepository } from './infrastructure/prescription-item.repository';
import { PrescriptionRepository } from './infrastructure/prescription.repository';
import { PrescriptionReviewRepository } from './infrastructure/prescription-review.repository';
import { AuditModule } from '../audit/audit.module';

/**
 * File 11 Part 03: owns `drug_catalog`, `prescriptions`, `prescription_items`,
 * `prescription_images`, `prescription_reviews` (File 12 Part 37 — patient
 * upload, quality-check gate, pharmacist review; doctor-issued prescriptions
 * are POSTPONE, per this module's README). No OCR/image-quality vendor and
 * no object storage are wired — `QualityCheckerPort`/`OcrExtractorPort` bind
 * to stub adapters here, same pattern as `identity-auth`'s `OtpSenderPort`.
 *
 * File 12 Part 39.3: exports `GetAcceptedPrescriptionForOrderUseCase` for
 * `pharmacy-fulfillment` to read an `ACCEPTED` prescription's fulfillable
 * items inside its own order-creation transaction. Part 39 (quote pass)
 * adds `GetPrescriptionItemDrugCodesUseCase` (a plain drug-code lookup for
 * items pharmacy-fulfillment already owns via its own `PharmacyOrderItem`
 * rows, needed to build a `Substitution.original_drug_code`) and
 * `GetDrugCatalogControlledStatusUseCase` (since `drug_catalog` is also
 * owned here).
 */
@Module({
  imports: [AuditModule],
  controllers: [PrescriptionsController],
  providers: [
    // infrastructure
    PrescriptionRepository,
    PrescriptionImageRepository,
    PrescriptionItemRepository,
    PrescriptionReviewRepository,
    DrugCatalogRepository,
    { provide: QUALITY_CHECKER, useClass: PassthroughQualityChecker },
    { provide: OCR_EXTRACTOR, useClass: NoOpOcrExtractor },
    // application
    UploadPrescriptionUseCase,
    GetPrescriptionUseCase,
    ListPrescriptionsUseCase,
    ReviewPrescriptionUseCase,
    GetAcceptedPrescriptionForOrderUseCase,
    GetPrescriptionItemDrugCodesUseCase,
    GetDrugCatalogControlledStatusUseCase,
  ],
  exports: [GetAcceptedPrescriptionForOrderUseCase, GetPrescriptionItemDrugCodesUseCase, GetDrugCatalogControlledStatusUseCase],
})
export class PrescriptionsModule {}
