import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OffsetPageMeta, buildPageMeta, resolveOffset } from '../../../shared/core/pagination/offset.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { RecomputeDoctorRatingUseCase } from '../../provider-directory/application/recompute-doctor-rating.use-case';
import { REVIEW_STATUS, summarizeRatings } from '../domain/review.rules';
import { ReviewRepository } from '../infrastructure/review.repository';
import { AdminReviewItem, toAdminReviewItem } from './review.mapper';

export interface AdminReviewsResult extends OffsetPageMeta {
  items: AdminReviewItem[];
}

@Injectable()
export class ListAdminReviewsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReviewRepository) private readonly reviews: ReviewRepository,
  ) {}

  async execute(input: { doctorId?: string; status?: string; page?: number; limit?: number }): Promise<AdminReviewsResult> {
    const { skip, take, page, limit } = resolveOffset(input);
    const { rows, total } = await this.reviews.listForAdmin(this.prisma, {
      doctorId: input.doctorId,
      status: input.status,
      skip,
      take,
    });
    return { items: rows.map(toAdminReviewItem), ...buildPageMeta(total, page, limit) };
  }
}

/** Hide/restore a review and refresh the doctor's aggregate in the same transaction. */
@Injectable()
export class SetReviewVisibilityUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReviewRepository) private readonly reviews: ReviewRepository,
    @Inject(RecomputeDoctorRatingUseCase) private readonly recomputeRating: RecomputeDoctorRatingUseCase,
  ) {}

  async execute(reviewId: string, hidden: boolean): Promise<{ id: string; status: string }> {
    const status = hidden ? REVIEW_STATUS.HIDDEN : REVIEW_STATUS.PUBLISHED;
    await this.prisma.$transaction(async (tx) => {
      const review = await this.reviews.findById(tx, reviewId);
      if (!review) {
        throw new NotFoundError('Review', reviewId);
      }
      if (review.status === status) {
        return;
      }
      await this.reviews.setStatus(tx, reviewId, review.version, status);
      await this.recomputeRating.execute(tx, review.subject_id, async () => {
        const { avg, count } = summarizeRatings(await this.reviews.countsByRating(tx, review.subject_id));
        return { avg, count };
      });
    });
    return { id: reviewId, status };
  }
}
