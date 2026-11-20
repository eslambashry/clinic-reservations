import { Module } from '@nestjs/common';
import { ProviderDirectoryModule } from '../provider-directory/provider-directory.module';
import { SchedulingAppointmentsModule } from '../scheduling-appointments/scheduling-appointments.module';
import { ReviewsController } from './api/reviews.controller';
import { ListAdminReviewsUseCase, SetReviewVisibilityUseCase } from './application/admin-reviews.use-cases';
import { CreateReviewUseCase } from './application/create-review.use-case';
import { GetReviewByAppointmentUseCase } from './application/get-review-by-appointment.use-case';
import { ListDoctorReviewsUseCase } from './application/list-doctor-reviews.use-case';
import { ReviewRepository } from './infrastructure/review.repository';

/**
 * Doctor reviews (un-postponed at the user's explicit direction, 2026-11-16).
 * Owns `reviews`. Reads appointments and writes `doctors.rating_*` only through
 * the exported application-layer seams of `scheduling-appointments` and
 * `provider-directory`, never their repositories.
 */
@Module({
  imports: [SchedulingAppointmentsModule, ProviderDirectoryModule],
  controllers: [ReviewsController],
  providers: [
    ReviewRepository,
    CreateReviewUseCase,
    GetReviewByAppointmentUseCase,
    ListDoctorReviewsUseCase,
    ListAdminReviewsUseCase,
    SetReviewVisibilityUseCase,
  ],
})
export class ReviewsModule {}
