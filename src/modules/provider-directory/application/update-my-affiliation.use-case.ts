import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AffiliationRepository } from '../infrastructure/affiliation.repository';
import { ListMyDoctorClinicsUseCase, MyDoctorClinic } from './list-my-doctor-clinics.use-case';
import { ResolveDoctorScopeUseCase } from './resolve-doctor-scope.use-case';

export interface UpdateMyAffiliationInput {
  status: 'ACTIVE' | 'PAUSED';
  consultFee?: number;
}

/**
 * `PATCH /v1/doctors/me/clinics/affiliations/{affiliationId}` (File 12 Part
 * 49.4) — the doctor-facing **deactivation** primitive, and the only one:
 * nothing on this surface deletes a clinic, a branch, or an affiliation.
 *
 * Pausing an affiliation stops future slot generation for it
 * (`ListSchedulableAffiliationsUseCase` filters on `AffiliationStatus`) and
 * hides the doctor from search at that branch, while leaving every existing
 * `appointment_slots`/`appointments` row untouched — so a doctor stepping
 * back from a branch can never silently drop appointments patients already
 * hold. Cancelling those stays a separate, explicit per-appointment action.
 *
 * The doctor owns the commercial consultation fee for their affiliation; the
 * application Admin only verifies the doctor and documents.
 */
@Injectable()
export class UpdateMyAffiliationUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ResolveDoctorScopeUseCase) private readonly doctorScope: ResolveDoctorScopeUseCase,
    @Inject(AffiliationRepository) private readonly affiliations: AffiliationRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ListMyDoctorClinicsUseCase) private readonly listMyClinics: ListMyDoctorClinicsUseCase,
  ) {}

  async execute(affiliationId: string, input: UpdateMyAffiliationInput, actor: AccessTokenPayload): Promise<MyDoctorClinic> {
    const scope = await this.doctorScope.execute(actor);
    if (!scope.affiliationIds.includes(affiliationId)) {
      throw new NotFoundError('DoctorClinicAffiliation', affiliationId);
    }

    await this.prisma.$transaction(async (tx) => {
      const affiliation = await this.affiliations.findById(tx, affiliationId);
      if (!affiliation) {
        throw new NotFoundError('DoctorClinicAffiliation', affiliationId);
      }

      await this.affiliations.update(tx, affiliationId, affiliation.version, {
        status: input.status,
        consultFee: input.consultFee?.toFixed(2),
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.affiliation.update_by_doctor',
        resourceType: 'doctor_clinic_affiliation',
        resourceId: affiliationId,
        reasonCode: input.status,
      });
    });

    const refreshed = await this.listMyClinics.execute(actor);
    const updated = refreshed.items.find((item) => item.affiliationId === affiliationId);
    if (!updated) {
      throw new NotFoundError('DoctorClinicAffiliation', affiliationId);
    }
    return updated;
  }
}
