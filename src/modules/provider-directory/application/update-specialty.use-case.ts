import { Inject, Injectable } from '@nestjs/common';
import { Specialty } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import {
  SpecialtyRepository,
  UpdateSpecialtyInput,
} from '../infrastructure/specialty.repository';

@Injectable()
export class UpdateSpecialtyUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SpecialtyRepository) private readonly specialties: SpecialtyRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(
    code: string,
    input: UpdateSpecialtyInput,
    actor: AccessTokenPayload,
  ): Promise<Specialty> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.specialties.findByCode(tx, code);
      if (!existing) throw new NotFoundError('specialty', code);

      if (input.parent_code !== undefined && input.parent_code !== null) {
        if (input.parent_code === code) {
          throw new ConflictError(
            'SPECIALTY_PARENT_CYCLE',
            'لا يمكن جعل التخصص تابعاً لنفسه',
            { code },
          );
        }

        const parent = await this.specialties.findByCode(tx, input.parent_code);
        if (!parent) throw new NotFoundError('specialty', input.parent_code);

        // Re-parenting under one of its own descendants would detach the
        // whole branch into a cycle, which the FK alone does not prevent.
        const parentAncestors = await this.specialties.ancestorCodes(tx, input.parent_code);
        if (parentAncestors.includes(code)) {
          throw new ConflictError(
            'SPECIALTY_PARENT_CYCLE',
            'لا يمكن جعل التخصص تابعاً لأحد تخصصاته الفرعية',
            { code, parentCode: input.parent_code },
          );
        }
      }

      const specialty = await this.specialties.update(tx, code, input);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.specialty.update',
        resourceType: 'specialty',
        resourceId: code,
      });

      return specialty;
    });
  }
}
