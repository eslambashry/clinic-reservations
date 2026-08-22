import { Inject, Injectable } from '@nestjs/common';
import { Prisma, ProviderType, ProviderVerificationDocument } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ClinicRepository } from '../infrastructure/clinic.repository';
import { DoctorRepository } from '../infrastructure/doctor.repository';
import { PharmacyRepository } from '../infrastructure/pharmacy.repository';
import { VerificationDocumentRepository } from '../infrastructure/verification-document.repository';

export interface UploadVerificationDocumentInput {
  providerType: ProviderType;
  providerId: string;
  docType: string;
  fileUrl: string;
}

/** File 12 Part 32.7: `fileUrl` is a pre-hosted URL — no upload flow yet (object storage vendor is OPEN). */
@Injectable()
export class UploadVerificationDocumentUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(VerificationDocumentRepository) private readonly documents: VerificationDocumentRepository,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
    @Inject(ClinicRepository) private readonly clinics: ClinicRepository,
    @Inject(PharmacyRepository) private readonly pharmacies: PharmacyRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(
    input: UploadVerificationDocumentInput,
    actor: AccessTokenPayload,
  ): Promise<ProviderVerificationDocument> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertProviderExists(tx, input.providerType, input.providerId);

      const document = await this.documents.create(tx, input);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.verification_document.upload',
        resourceType: 'provider_verification_document',
        resourceId: document.id,
      });

      return document;
    });
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
          'Laboratory verification is not supported yet (Laboratory is a postponed module).',
        );
    }
  }
}
