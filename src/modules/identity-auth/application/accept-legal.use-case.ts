import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { LEGAL_CONSENT_TYPES, LEGAL_VERSION } from '../domain/legal.constants';

/**
 * Records that the user accepted the Terms of Service and Privacy Policy at
 * registration. Stored in `consents` (one row per document, `consent_type`
 * suffixed with the version) so an acceptance trail exists per version.
 * Idempotent: re-sending the same version is a no-op.
 */
@Injectable()
export class AcceptLegalUseCase {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(userId: string, version: string): Promise<void> {
    if (version !== LEGAL_VERSION) {
      throw new BusinessRuleError('LEGAL_VERSION_MISMATCH', 'نسخة الشروط والأحكام غير صحيحة.');
    }
    for (const type of LEGAL_CONSENT_TYPES) {
      const consentType = `${type}:${version}`;
      const existing = await this.prisma.consent.findFirst({
        where: { patient_id: userId, consent_type: consentType, granted: true, revoked_at: null },
        select: { id: true },
      });
      if (!existing) {
        await this.prisma.consent.create({ data: { patient_id: userId, consent_type: consentType, granted: true } });
      }
    }
  }
}
