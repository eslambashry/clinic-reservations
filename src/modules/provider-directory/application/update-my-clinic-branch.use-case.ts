import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AddressRepository } from '../infrastructure/address.repository';
import { ClinicBranchRepository } from '../infrastructure/clinic-branch.repository';
import { ListMyDoctorClinicsUseCase, MyDoctorClinic } from './list-my-doctor-clinics.use-case';
import { ResolveDoctorScopeUseCase } from './resolve-doctor-scope.use-case';

/**
 * Operational branch fields only (File 12 Part 49.3). `status`,
 * `verified_at`, `clinic_id` and the address's `regionCode`/`countryCode`
 * are absent by design: verification is Admin-only (File 11 07.3) and the
 * region/country codes drive search partitioning, not day-to-day operations.
 */
export interface UpdateMyClinicBranchInput {
  phone?: string;
  ianaTimezone?: string;
  address?: {
    line1?: string;
    city?: string;
  };
}

/**
 * `PATCH /v1/doctors/me/clinics/branches/{branchId}` (File 12 Part 49.3).
 *
 * Ownership is enforced here, in the application layer, against the
 * JWT-derived `DoctorScope` — the controller only forwards the path param,
 * and the repository is never asked for a branch the caller does not own. A
 * branch outside the caller's scope is a 404, not a 403 (existence hiding,
 * Part 35.11's convention).
 *
 * A clinic branch is a **shared** resource — several doctors can be
 * affiliated with the same one, so this edit is visible to all of them. That
 * is why every call writes an `audit_logs` row naming the acting doctor.
 */
@Injectable()
export class UpdateMyClinicBranchUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ResolveDoctorScopeUseCase) private readonly doctorScope: ResolveDoctorScopeUseCase,
    @Inject(ClinicBranchRepository) private readonly branches: ClinicBranchRepository,
    @Inject(AddressRepository) private readonly addresses: AddressRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ListMyDoctorClinicsUseCase) private readonly listMyClinics: ListMyDoctorClinicsUseCase,
  ) {}

  async execute(branchId: string, input: UpdateMyClinicBranchInput, actor: AccessTokenPayload): Promise<MyDoctorClinic> {
    const scope = await this.doctorScope.execute(actor);
    if (!scope.clinicBranchIds.includes(branchId)) {
      throw new NotFoundError('ClinicBranch', branchId);
    }

    await this.prisma.$transaction(async (tx) => {
      const branch = await this.branches.findByIdWithRelations(tx, branchId);
      if (!branch) {
        throw new NotFoundError('ClinicBranch', branchId);
      }

      if (input.phone !== undefined || input.ianaTimezone !== undefined) {
        await this.branches.update(tx, branchId, branch.version, {
          phone: input.phone,
          ianaTimezone: input.ianaTimezone,
        });
      }

      if (input.address && (input.address.line1 !== undefined || input.address.city !== undefined)) {
        await this.addresses.update(tx, branch.address_id, branch.address.version, {
          line1: input.address.line1,
          city: input.address.city,
        });
      }

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.clinic_branch.update_by_doctor',
        resourceType: 'clinic_branch',
        resourceId: branchId,
      });
    });

    const refreshed = await this.listMyClinics.execute(actor);
    const updated = refreshed.items.find((item) => item.clinicBranchId === branchId);
    if (!updated) {
      // Only reachable if the affiliation was removed concurrently with this
      // update — surfaced as a 404 rather than a fabricated success body.
      throw new NotFoundError('ClinicBranch', branchId);
    }
    return updated;
  }
}
