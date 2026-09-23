import { Inject, Injectable } from '@nestjs/common';
import { Specialty } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import {
  CreateSpecialtyInput,
  SpecialtyRepository,
} from '../infrastructure/specialty.repository';

@Injectable()
export class CreateSpecialtyUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SpecialtyRepository) private readonly specialties: SpecialtyRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(input: CreateSpecialtyInput, actor: AccessTokenPayload): Promise<Specialty> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.specialties.findByCode(tx, input.code);
      if (existing) {
        throw new ConflictError(
          'SPECIALTY_CODE_EXISTS',
          `يوجد تخصص بالكود ${input.code} بالفعل`,
          { code: input.code },
        );
      }

      // Checked explicitly so a bad parent is a 404 naming the parent rather
      // than a raw FK violation from the insert.
      if (input.parent_code) {
        const parent = await this.specialties.findByCode(tx, input.parent_code);
        if (!parent) throw new NotFoundError('specialty', input.parent_code);
      }

      const specialty = await this.specialties.create(tx, input);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.specialty.create',
        resourceType: 'specialty',
        resourceId: specialty.code,
      });

      return specialty;
    });
  }
}
