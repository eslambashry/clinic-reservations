import { Inject, Injectable } from '@nestjs/common';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { GetAppointmentForReviewUseCase } from '../../scheduling-appointments/application/get-appointment-for-review.use-case';
import { ReviewRepository } from '../infrastructure/review.repository';
import { MyReview, toMyReview } from './review.mapper';

/** The caller's own review of one of their appointments, or `null` (drives the "rate your doctor" prompt). */
@Injectable()
export class GetReviewByAppointmentUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReviewRepository) private readonly reviews: ReviewRepository,
    @Inject(GetAppointmentForReviewUseCase) private readonly appointments: GetAppointmentForReviewUseCase,
  ) {}

  async execute(appointmentId: string, actor: AccessTokenPayload): Promise<{ review: MyReview | null }> {
    await this.appointments.execute(appointmentId, actor.sub);
    const review = await this.reviews.findByAppointmentId(this.prisma, appointmentId);
    return { review: review ? toMyReview(review) : null };
  }
}
