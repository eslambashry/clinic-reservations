import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { SpecialtyRepository } from '../infrastructure/specialty.repository';

/** Arabic pluralisation for the two counts named in the refusal message. */
function doctorsPhrase(count: number): string {
  if (count === 1) return 'طبيب واحد';
  if (count === 2) return 'طبيبين';
  if (count <= 10) return `${count} أطباء`;
  return `${count} طبيباً`;
}

function childrenPhrase(count: number): string {
  if (count === 1) return 'تخصص فرعي واحد';
  if (count === 2) return 'تخصصين فرعيين';
  if (count <= 10) return `${count} تخصصات فرعية`;
  return `${count} تخصصاً فرعياً`;
}

@Injectable()
export class DeleteSpecialtyUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SpecialtyRepository) private readonly specialties: SpecialtyRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Deletes a specialty only when nothing depends on it.
   *
   * Both counts are refusals rather than cascades: `doctors.specialty_code`
   * is NOT NULL with ON DELETE RESTRICT (the database would reject the
   * delete anyway, with an opaque error), and `specialties.parent_code` is
   * ON DELETE SET NULL, which would quietly promote every child to
   * top-level. Counting first turns both into one clear 409.
   */
  async execute(code: string, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await this.specialties.findByCode(tx, code);
      if (!existing) throw new NotFoundError('specialty', code);

      const [doctorCount, childCount] = await Promise.all([
        this.specialties.countDoctors(tx, code),
        this.specialties.countChildren(tx, code),
      ]);

      if (doctorCount > 0 || childCount > 0) {
        const reasons = [
          ...(doctorCount > 0 ? [doctorsPhrase(doctorCount)] : []),
          ...(childCount > 0 ? [childrenPhrase(childCount)] : []),
        ].join(' و');

        throw new ConflictError(
          'SPECIALTY_IN_USE',
          `لا يمكن حذف هذا التخصص لارتباطه بـ ${reasons}`,
          { code, doctorCount, childCount },
        );
      }

      await this.specialties.delete(tx, code);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.specialty.delete',
        resourceType: 'specialty',
        resourceId: code,
      });
    });
  }
}
