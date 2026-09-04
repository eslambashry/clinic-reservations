import { Inject, Injectable } from '@nestjs/common';
import { Prisma, ProviderType, ProviderVerificationDocument } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { MEDIA_CONSTANTS } from '../../../shared/config/constants';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { MEDIA_STORAGE, MediaStoragePort, UploadedMediaFile } from '../../../shared/kernel/storage/media-storage.port';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ClinicRepository } from '../infrastructure/clinic.repository';
import { DoctorRepository } from '../infrastructure/doctor.repository';
import { PharmacyRepository } from '../infrastructure/pharmacy.repository';
import { VerificationDocumentRepository } from '../infrastructure/verification-document.repository';

export interface UploadVerificationDocumentInput {
  providerType: ProviderType;
  providerId: string;
  docType: string;
  file: UploadedMediaFile;
}

/**
 * File 12 Part 32.7 (superseded): the document now uploads to ImageKit —
 * private (`isPrivate: true`), since a medical license/syndicate ID/
 * commercial registration is exactly the kind of sensitive document File
 * 11's PHI table demands "restricted IAM" for, not a publicly guessable
 * link. Admin may upload for any provider. A DOCTOR-context actor may only
 * upload for `providerType: 'DOCTOR'` and their own doctor id (resolved via
 * `DoctorRepository.findByUserId`) — enforced in `assertOwnershipForDoctor`.
 */
@Injectable()
export class UploadVerificationDocumentUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(VerificationDocumentRepository) private readonly documents: VerificationDocumentRepository,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
    @Inject(ClinicRepository) private readonly clinics: ClinicRepository,
    @Inject(PharmacyRepository) private readonly pharmacies: PharmacyRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MEDIA_STORAGE) private readonly mediaStorage: MediaStoragePort,
  ) {}

  async execute(
    input: UploadVerificationDocumentInput,
    actor: AccessTokenPayload,
  ): Promise<ProviderVerificationDocument> {
    // Checked before uploading — an invalid providerId should fail fast, not consume an ImageKit upload for a file that will never be persisted.
    await this.assertProviderExists(this.prisma, input.providerType, input.providerId);

    // Self-service: a DOCTOR-context actor may only attach documents to their own doctor record.
    if (actor.contextType === 'DOCTOR') {
      await this.assertOwnershipForDoctor(this.prisma, input.providerType, input.providerId, actor.sub);
    }

    // Uploaded ahead of the transaction — same reasoning as `UploadPrescriptionUseCase`: an external round trip has no business holding a DB transaction open.
    const stored = await this.mediaStorage.upload(input.file, {
      folder: `provider-verification/${input.providerType}/${input.providerId}`,
      isPrivate: true,
    });

    return this.prisma.$transaction(async (tx) => {
      const document = await this.documents.create(tx, {
        providerType: input.providerType,
        providerId: input.providerId,
        docType: input.docType,
        fileUrl: stored.url,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.verification_document.upload',
        resourceType: 'provider_verification_document',
        resourceId: document.id,
      });

      // Response carries a signed, immediately-usable URL — the persisted `file_url` stays the unsigned canonical form.
      return { ...document, file_url: this.mediaStorage.getSignedUrl(document.file_url, MEDIA_CONSTANTS.SIGNED_URL_TTL_SECONDS) };
    });
  }

  private async assertOwnershipForDoctor(
    tx: Prisma.TransactionClient,
    providerType: ProviderType,
    providerId: string,
    actorUserId: string,
  ): Promise<void> {
    if (providerType !== 'DOCTOR') {
      throw new ForbiddenError('FORBIDDEN', 'لا يمكن للطبيب رفع مستندات التوثيق إلا لملفه الشخصي.');
    }

    const ownDoctor = await this.doctors.findByUserId(tx, actorUserId);
    if (!ownDoctor || ownDoctor.id !== providerId) {
      throw new ForbiddenError('FORBIDDEN', 'لا يمكن للطبيب رفع مستندات التوثيق إلا لملفه الشخصي.');
    }
  }

  private async assertProviderExists(
    tx: Prisma.TransactionClient,
    providerType: ProviderType,
    providerId: string,
  ): Promise<void> {
    switch (providerType) {
      case 'DOCTOR': {
        const doctor = await this.doctors.findById(tx, providerId);
        if (!doctor) throw new NotFoundError('Doctor', providerId);
        return;
      }
      case 'CLINIC': {
        const clinic = await this.clinics.findById(tx, providerId);
        if (!clinic) throw new NotFoundError('Clinic', providerId);
        return;
      }
      case 'PHARMACY': {
        const pharmacy = await this.pharmacies.findById(tx, providerId);
        if (!pharmacy) throw new NotFoundError('Pharmacy', providerId);
        return;
      }
      case 'LAB':
        // File 12 Part 32.2: Laboratory is POSTPONE — no `laboratories` table
        // exists to reference, so this is rejected explicitly rather than
        // hitting a confusing FK failure.
        throw new BusinessRuleError(
          'PROVIDER_TYPE_NOT_SUPPORTED',
          'توثيق المعامل غير متاح حاليًا.',
        );
    }
  }
}
