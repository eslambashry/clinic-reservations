import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { VerificationDocumentRepository } from '../infrastructure/verification-document.repository';

@Injectable()
export class RejectVerificationDocumentUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: VerificationDocumentRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(documentId: string, reasonCode: string, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const document = await this.documents.findById(tx, documentId);
      if (!document) {
        throw new NotFoundError('ProviderVerificationDocument', documentId);
      }

      await this.documents.setDecision(tx, documentId, document.version, 'REJECTED', actor.sub);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.verification_document.reject',
        resourceType: 'provider_verification_document',
        resourceId: documentId,
        reasonCode,
      });
    });
  }
}
