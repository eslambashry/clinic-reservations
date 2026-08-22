import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { OCR_EXTRACTOR, OcrExtractorPort } from './ports/ocr-extractor.port';
import { QUALITY_CHECKER, QualityCheckerPort } from './ports/quality-checker.port';
import { PrescriptionImageRepository } from '../infrastructure/prescription-image.repository';
import { PrescriptionItemRepository } from '../infrastructure/prescription-item.repository';
import { PrescriptionRepository } from '../infrastructure/prescription.repository';

export interface UploadPrescriptionInput {
  fileUrls: string[];
  notes?: string;
}

export interface UploadPrescriptionResult {
  prescriptionId: string;
  status: 'QUALITY_CHECK_PASSED' | 'QUALITY_CHECK_FAILED';
}

/**
 * File 10 §2.3 `POST /v1/prescriptions/upload` / File 12 Part 37.1-37.2.
 * Quality-check and OCR both run synchronously inline here (not via a worker
 * job) because both are stub adapters with no real external latency —
 * `QualityCheckerPort`/`OcrExtractorPort` swap to real vendors later without
 * this use-case changing. Response `status` is the real post-check value,
 * not the literal `"UPLOADED"` File 10's contract shows — more useful given
 * there is no actual async wait for a client to poll through.
 */
@Injectable()
export class UploadPrescriptionUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PrescriptionRepository) private readonly prescriptions: PrescriptionRepository,
    @Inject(PrescriptionImageRepository) private readonly images: PrescriptionImageRepository,
    @Inject(PrescriptionItemRepository) private readonly items: PrescriptionItemRepository,
    @Inject(QUALITY_CHECKER) private readonly qualityChecker: QualityCheckerPort,
    @Inject(OCR_EXTRACTOR) private readonly ocrExtractor: OcrExtractorPort,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(input: UploadPrescriptionInput, actor: AccessTokenPayload): Promise<UploadPrescriptionResult> {
    // Quality-check runs per file before touching the database — cheap, stub-backed, no reason to hold a transaction open for it.
    const qualityResults = await Promise.all(input.fileUrls.map((fileUrl) => this.qualityChecker.check(fileUrl)));
    const allPassed = qualityResults.every((result) => result.passed);

    // OCR only runs against images that actually passed quality — no point extracting from a failed photo.
    const ocrSuggestions = allPassed
      ? (await Promise.all(input.fileUrls.map((fileUrl) => this.ocrExtractor.extract(fileUrl)))).flat()
      : [];

    return this.prisma.$transaction(async (tx) => {
      const prescription = await this.prescriptions.create(tx, {
        patientId: actor.sub,
        source: 'PATIENT_UPLOADED',
      });

      await this.images.createMany(
        tx,
        input.fileUrls.map((fileUrl, index) => ({ prescriptionId: prescription.id, fileUrl, qualityCheck: qualityResults[index] })),
      );

      if (ocrSuggestions.length > 0) {
        await this.items.createManySuggested(tx, prescription.id, ocrSuggestions);
      }

      const status = allPassed ? 'QUALITY_CHECK_PASSED' : 'QUALITY_CHECK_FAILED';
      await this.prescriptions.setStatus(tx, prescription.id, prescription.version, status);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'prescriptions.prescription.upload',
        resourceType: 'prescription',
        resourceId: prescription.id,
      });

      await this.outbox.emit(tx, 'PrescriptionUploaded', { prescriptionId: prescription.id, patientId: actor.sub, status });

      return { prescriptionId: prescription.id, status };
    });
  }
}
