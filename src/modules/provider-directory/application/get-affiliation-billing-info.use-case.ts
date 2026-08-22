import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { AffiliationRepository } from '../infrastructure/affiliation.repository';

export interface AffiliationBillingInfo {
  consultFee: string;
  currency: string;
  doctorId: string;
}

/**
 * File 12 Part 36.3 — `payments`' only way to read what an appointment
 * confirm should charge. Unlike this module's other two exports
 * (`ResolveAffiliationForSchedulingUseCase`/`ListSchedulableAffiliationsUseCase`,
 * both of which inject `PrismaService` and open their own implicit
 * connection), this one takes `tx: Prisma.TransactionClient` explicitly —
 * the consult-fee read must happen inside the same transaction that later
 * captures a payment against it, or a rate change could land between the
 * read and the write it feeds.
 */
@Injectable()
export class GetAffiliationBillingInfoUseCase {
  constructor(@Inject(AffiliationRepository) private readonly affiliations: AffiliationRepository) {}

  async execute(tx: Prisma.TransactionClient, affiliationId: string): Promise<AffiliationBillingInfo> {
    const affiliation = await this.affiliations.findById(tx, affiliationId);
    if (!affiliation) {
      throw new NotFoundError('DoctorClinicAffiliation', affiliationId);
    }

    return { consultFee: affiliation.consult_fee.toString(), currency: affiliation.currency, doctorId: affiliation.doctor_id };
  }
}
