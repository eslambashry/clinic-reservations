import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { SELF_DELETABLE_ROLE_CODES } from '../domain/legal.constants';
import { DeviceRepository } from '../infrastructure/device.repository';
import { RefreshTokenRepository } from '../infrastructure/refresh-token.repository';

const OPEN_APPOINTMENT_STATUSES = ['HELD', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] as const;

/**
 * Self-service account deletion (Apple 5.1.1(v) / Google Play requirement).
 *
 * Soft-delete + anonymise, not a hard delete: appointments, encounters,
 * prescriptions, payments and the wallet ledger must survive for medical and
 * financial record-keeping, and several FKs to `users` are RESTRICT. So the
 * row is kept, every personal identifier is scrubbed, `deleted_at` is set, and
 * the unique `phone`/`email` are freed so the person can register again later.
 * Sessions are revoked and push devices removed; role memberships are revoked
 * so the account can never authenticate again.
 *
 * Refused (409) while the user still has an open appointment or wallet funds,
 * so no one is left waiting on a deleted counterpart or loses money.
 */
@Injectable()
export class DeleteAccountUseCase {
  private readonly logger = new Logger(DeleteAccountUseCase.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RefreshTokenRepository) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(DeviceRepository) private readonly devices: DeviceRepository,
  ) {}

  async execute(userId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await this.refreshTokens.lockUserForAuthMutation(tx, userId);

        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user || user.deleted_at) {
          throw new NotFoundError('User', userId);
        }

        const memberships = await tx.roleMembership.findMany({ where: { user_id: userId, status: 'ACTIVE' } });
        if (memberships.some((m) => !SELF_DELETABLE_ROLE_CODES.includes(m.role_code))) {
          throw new ForbiddenError('ROLE_NOT_PERMITTED', 'لا يمكن حذف هذا النوع من الحسابات من داخل التطبيق. تواصل مع الدعم.');
        }

        const doctor = await tx.doctor.findUnique({ where: { user_id: userId }, select: { id: true } });
        const openAppointments = await tx.appointment.count({
          where: {
            status: { in: [...OPEN_APPOINTMENT_STATUSES] },
            OR: [{ patient_id: userId }, ...(doctor ? [{ affiliation: { doctor_id: doctor.id } }] : [])],
          },
        });
        if (openAppointments > 0) {
          throw new ConflictError(
            'ACCOUNT_HAS_OPEN_APPOINTMENTS',
            'لديك مواعيد قائمة. يرجى إلغاؤها أو إنهاؤها قبل حذف الحساب.',
            { openAppointments },
          );
        }

        const wallet = await tx.wallet.findUnique({ where: { user_id: userId }, select: { balance: true } });
        if (wallet && wallet.balance.gt(0)) {
          throw new ConflictError('ACCOUNT_HAS_WALLET_BALANCE', 'لديك رصيد في المحفظة. يرجى استرداده أو استخدامه قبل حذف الحساب.');
        }

        const now = new Date();
        await tx.user.update({
          where: { id: userId },
          data: {
            // `phone` is NOT NULL + unique: replace it with an unroutable placeholder.
            phone: `deleted:${userId}`,
            email: null,
            first_name: null,
            last_name: null,
            password_hash: null,
            status: 'SUSPENDED',
            deleted_at: now,
          },
        });
        if (doctor) {
          await tx.doctor.update({
            where: { id: doctor.id },
            data: { deleted_at: now, status: 'SUSPENDED', photo_url: null, bio: null, degree: null },
          });
        }
        await tx.roleMembership.updateMany({ where: { user_id: userId, status: 'ACTIVE' }, data: { status: 'REVOKED' } });
        await this.refreshTokens.revokeAllActiveForUser(tx, userId);
        await this.devices.deleteAllForUser(tx, userId);
        await tx.notificationPreference.deleteMany({ where: { user_id: userId } });
      },
      { timeout: 15000 },
    );
    this.logger.log(`Account deleted (anonymised) for user ${userId}`);
  }
}
