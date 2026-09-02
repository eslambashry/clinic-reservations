import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { MEDIA_STORAGE, MediaStoragePort, UploadedMediaFile } from '../../../shared/kernel/storage/media-storage.port';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { OCR_EXTRACTOR, OcrExtractorPort } from './ports/ocr-extractor.port';
import { QUALITY_CHECKER, QualityCheckerPort } from './ports/quality-checker.port';
import { PrescriptionImageRepository } from '../infrastructure/prescription-image.repository';
import { PrescriptionItemRepository } from '../infrastructure/prescription-item.repository';
import { PrescriptionRepository } from '../infrastructure/prescription.repository';

export interface UploadPrescriptionInput {
  files: UploadedMediaFile[];
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
 *
 * Files upload to ImageKit (`MEDIA_STORAGE`, private — PHI, File 11's
 * encryption table requires restricted access, not a public URL) before the
 * transaction opens, same reasoning as running quality-check/OCR ahead of
 * it: an external round trip has no business holding a DB transaction open.
 * `QualityCheckerPort`/`OcrExtractorPort` still take a `fileUrl: string` —
 * unchanged, they run against the now-uploaded ImageKit URL exactly as they
 * used to run against the pre-hosted one.
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
    @Inject(MEDIA_STORAGE) private readonly mediaStorage: MediaStoragePort,
  ) {}

  async execute(input: UploadPrescriptionInput, actor: AccessTokenPayload): Promise<UploadPrescriptionResult> {
    const uploaded = await Promise.all(
      input.files.map((file) => this.mediaStorage.upload(file, { folder: `prescriptions/${actor.sub}`, isPrivate: true })),
    );
    const fileUrls = uploaded.map((stored) => stored.url);

    // Quality-check runs per file before touching the database — cheap, stub-backed, no reason to hold a transaction open for it.
    const qualityResults = await Promise.all(fileUrls.map((fileUrl) => this.qualityChecker.check(fileUrl)));
    const allPassed = qualityResults.every((result) => result.passed);

    // OCR only runs against images that actually passed quality — no point extracting from a failed photo.
    const ocrSuggestions = allPassed
      ? (await Promise.all(fileUrls.map((fileUrl) => this.ocrExtractor.extract(fileUrl)))).flat()
      : [];

    return this.prisma.$transaction(async (tx) => {
      const prescription = await this.prescriptions.create(tx, {
        patientId: actor.sub,
        source: 'PATIENT_UPLOADED',
        notes: input.notes,
      });

      await this.images.createMany(
        tx,
        fileUrls.map((fileUrl, index) => ({ prescriptionId: prescription.id, fileUrl, qualityCheck: qualityResults[index] })),
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
