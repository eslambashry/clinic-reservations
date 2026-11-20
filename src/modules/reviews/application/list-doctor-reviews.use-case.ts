import { Inject, Injectable } from '@nestjs/common';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { DomainError } from '../../../shared/core/errors/domain-errors';
import { arErrorMessage } from '../../../shared/core/errors/error-messages.ar';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AssertDoctorVisibleUseCase } from '../../provider-directory/application/assert-doctor-visible.use-case';
import { ResolveDoctorScopeUseCase } from '../../provider-directory/application/resolve-doctor-scope.use-case';
import { summarizeRatings } from '../domain/review.rules';
import { ReviewRepository } from '../infrastructure/review.repository';
import { ReviewItem, toReviewItem } from './review.mapper';

export interface DoctorReviewsResult {
  summary: { avg: number; count: number; distribution: Record<1 | 2 | 3 | 4 | 5, number> };
  items: ReviewItem[];
  nextCursor: string | null;
}

interface ReviewCursor {
  c: string;
  i: string;
}

const DEFAULT_LIMIT = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCursor(raw: string | undefined): ReviewCursor | undefined {
  const decoded = decodeCursor<Partial<ReviewCursor>>(raw);
  if (!decoded) {
    return undefined;
  }
  const valid =
    typeof decoded.c === 'string' &&
    !Number.isNaN(new Date(decoded.c).getTime()) &&
    typeof decoded.i === 'string' &&
    UUID.test(decoded.i);
  if (!valid) {
    throw new DomainError(400, 'VALIDATION_ERROR', arErrorMessage('VALIDATION_ERROR'), { field: 'cursor' });
  }
  return decoded as ReviewCursor;
}

/** PUBLISHED reviews of one doctor + the star histogram. Backs the public doctor page and the doctor's own `me` view. */
@Injectable()
export class ListDoctorReviewsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReviewRepository) private readonly reviews: ReviewRepository,
    @Inject(ResolveDoctorScopeUseCase) private readonly doctorScope: ResolveDoctorScopeUseCase,
    @Inject(AssertDoctorVisibleUseCase) private readonly doctorVisible: AssertDoctorVisibleUseCase,
  ) {}

  async executeForMe(actor: AccessTokenPayload, input: { cursor?: string; limit?: number }): Promise<DoctorReviewsResult> {
    const scope = await this.doctorScope.execute(actor);
    return this.list(scope.doctorId, input);
  }

  /** Public route: a doctor hidden from the directory exposes nothing here either. */
  async execute(
    doctorId: string,
    input: { cursor?: string; limit?: number },
    callerContextType: string | undefined,
  ): Promise<DoctorReviewsResult> {
    await this.doctorVisible.execute(doctorId, callerContextType);
    return this.list(doctorId, input);
  }

  private async list(doctorId: string, input: { cursor?: string; limit?: number }): Promise<DoctorReviewsResult> {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const cursor = parseCursor(input.cursor);
    const [counts, rows] = await Promise.all([
      this.reviews.countsByRating(this.prisma, doctorId),
      this.reviews.listForDoctor(this.prisma, { doctorId, status: 'PUBLISHED', limit, cursor }),
    ]);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      summary: summarizeRatings(counts),
      items: page.map(toReviewItem),
      nextCursor: rows.length > limit && last ? encodeCursor<ReviewCursor>({ c: last.created_at.toISOString(), i: last.id }) : null,
    };
  }
}
