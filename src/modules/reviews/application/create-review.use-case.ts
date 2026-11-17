import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ConflictError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { RecomputeDoctorRatingUseCase } from '../../provider-directory/application/recompute-doctor-rating.use-case';
import { GetAppointmentForReviewUseCase } from '../../scheduling-appointments/application/get-appointment-for-review.use-case';
import { isReviewableAppointmentStatus, summarizeRatings } from '../domain/review.rules';
import { ReviewRepository } from '../infrastructure/review.repository';
import { MyReview, toMyReview } from './review.mapper';

export interface CreateReviewInput {
  appointmentId: string;
  rating: number;
  comment?: string;
}

/**
 * Patient rates the doctor after a completed visit. One review per appointment
 * (also unique-indexed). Review insert, doctor aggregate refresh and the
 * `DoctorReviewed` outbox event commit atomically.
 */
@Injectable()
export class CreateReviewUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReviewRepository) private readonly reviews: ReviewRepository,
    @Inject(GetAppointmentForReviewUseCase) private readonly appointments: GetAppointmentForReviewUseCase,
    @Inject(RecomputeDoctorRatingUseCase) private readonly recomputeRating: RecomputeDoctorRatingUseCase,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(input: CreateReviewInput, actor: AccessTokenPayload): Promise<MyReview> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const appointment = await this.appointments.execute(input.appointmentId, actor.sub, tx);
        if (!isReviewableAppointmentStatus(appointment.status)) {
          throw new BusinessRuleError('APPOINTMENT_NOT_REVIEWABLE', 'يمكنك تقييم الدكتور بعد انتهاء الكشف فقط.', {
            appointmentStatus: appointment.status,
          });
        }
        if (await this.reviews.findByAppointmentId(tx, appointment.appointmentId)) {
          throw new ConflictError('REVIEW_ALREADY_EXISTS', 'لقد قيّمت هذا الموعد من قبل.');
        }

        const review = await this.reviews.create(tx, {
          patientId: actor.sub,
          doctorId: appointment.doctorId,
          appointmentId: appointment.appointmentId,
          rating: input.rating,
          comment: input.comment?.trim() || null,
        });

        const { doctorUserId } = await this.recomputeRating.execute(tx, appointment.doctorId, async () => {
          const { avg, count } = summarizeRatings(await this.reviews.countsByRating(tx, appointment.doctorId));
          return { avg, count };
        });

        await this.outbox.emit(tx, 'DoctorReviewed', {
          doctorUserId,
          reviewId: review.id,
          appointmentId: appointment.appointmentId,
          rating: input.rating,
        });

        return toMyReview(review);
      });
    } catch (error) {
      // Two concurrent submits for the same appointment: the loser hits the unique index.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('REVIEW_ALREADY_EXISTS', 'لقد قيّمت هذا الموعد من قبل.');
      }
      throw error;
    }
  }
}
