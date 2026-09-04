import { Inject, Injectable } from '@nestjs/common';
import { DoctorClinicAffiliation, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AffiliationRepository } from '../infrastructure/affiliation.repository';
import { ClinicBranchRepository } from '../infrastructure/clinic-branch.repository';
import { DoctorRepository } from '../infrastructure/doctor.repository';

export interface CreateAffiliationInput {
  clinicBranchId: string;
  consultFee: string;
  currency: string;
}

@Injectable()
export class CreateAffiliationUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
    @Inject(ClinicBranchRepository) private readonly branches: ClinicBranchRepository,
    @Inject(AffiliationRepository) private readonly affiliations: AffiliationRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(
    doctorId: string,
    input: CreateAffiliationInput,
    actor: AccessTokenPayload,
  ): Promise<DoctorClinicAffiliation> {
    return this.prisma.$transaction(async (tx) => {
      const doctor = await this.doctors.findById(tx, doctorId);
      if (!doctor) {
        throw new NotFoundError('Doctor', doctorId);
      }
      const branch = await this.branches.findById(tx, input.clinicBranchId);
      if (!branch) {
        throw new NotFoundError('ClinicBranch', input.clinicBranchId);
      }

      let affiliation: DoctorClinicAffiliation;
      try {
        affiliation = await this.affiliations.create(tx, { doctorId, ...input });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictError('AFFILIATION_ALREADY_EXISTS', 'هذا الطبيب مرتبط بهذا الفرع بالفعل.', {
            doctorId,
            clinicBranchId: input.clinicBranchId,
          });
        }
        throw error;
      }

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.affiliation.create',
        resourceType: 'doctor_clinic_affiliation',
        resourceId: affiliation.id,
      });

      return affiliation;
    });
  }
}
