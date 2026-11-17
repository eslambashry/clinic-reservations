import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { OptionalAuth } from '../../../shared/core/auth/optional-auth.decorator';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { AdminReviewsResult, ListAdminReviewsUseCase, SetReviewVisibilityUseCase } from '../application/admin-reviews.use-cases';
import { CreateReviewUseCase } from '../application/create-review.use-case';
import { GetReviewByAppointmentUseCase } from '../application/get-review-by-appointment.use-case';
import { DoctorReviewsResult, ListDoctorReviewsUseCase } from '../application/list-doctor-reviews.use-case';
import { MyReview } from '../application/review.mapper';
import { CreateReviewDto } from './dto/create-review.dto';
import { AdminListReviewsQueryDto, ListDoctorReviewsQueryDto } from './dto/list-reviews-query.dto';
import { SetReviewVisibilityDto } from './dto/set-review-visibility.dto';

/**
 * Doctor reviews. Patients write (one per completed appointment); everyone can
 * read a doctor's published reviews; the doctor reads their own; Admin lists
 * all and hides/restores (no `/admin` URL prefix, matching the doctors routes).
 */
@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(
    @Inject(CreateReviewUseCase) private readonly createReview: CreateReviewUseCase,
    @Inject(GetReviewByAppointmentUseCase) private readonly getByAppointment: GetReviewByAppointmentUseCase,
    @Inject(ListDoctorReviewsUseCase) private readonly listDoctorReviews: ListDoctorReviewsUseCase,
    @Inject(ListAdminReviewsUseCase) private readonly listAdminReviews: ListAdminReviewsUseCase,
    @Inject(SetReviewVisibilityUseCase) private readonly setVisibility: SetReviewVisibilityUseCase,
  ) {}

  @ApiBearerAuth()
  @Roles(RoleContextType.PATIENT)
  @Post('reviews')
  @ApiOperation({ summary: 'Patient rates the doctor of a COMPLETED appointment (one review per appointment)' })
  create(@Body() dto: CreateReviewDto, @CurrentUser() user: AccessTokenPayload): Promise<MyReview> {
    return this.createReview.execute(dto, user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.PATIENT)
  @Get('reviews/by-appointment/:appointmentId')
  @ApiOperation({ summary: "The caller's review of one of their appointments, or { review: null }" })
  byAppointment(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<{ review: MyReview | null }> {
    return this.getByAppointment.execute(appointmentId, user);
  }

  // Registered before `doctors/:doctorId/reviews` — a literal 'me' would otherwise hit that param's ParseUUIDPipe.
  @ApiBearerAuth()
  @Roles(RoleContextType.DOCTOR, RoleContextType.CLINIC_STAFF)
  @Get('doctors/me/reviews')
  @ApiOperation({ summary: "The calling doctor's own published reviews + star distribution" })
  mine(@Query() query: ListDoctorReviewsQueryDto, @CurrentUser() user: AccessTokenPayload): Promise<DoctorReviewsResult> {
    return this.listDoctorReviews.executeForMe(user, query);
  }

  @OptionalAuth()
  @Get('doctors/:doctorId/reviews')
  @ApiOperation({ summary: "Public: a doctor's published reviews + star distribution, newest-first, cursor-paginated" })
  forDoctor(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
    @Query() query: ListDoctorReviewsQueryDto,
    @CurrentUser() user: AccessTokenPayload | undefined,
  ): Promise<DoctorReviewsResult> {
    return this.listDoctorReviews.execute(doctorId, query, user?.contextType);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Get('reviews')
  @ApiOperation({ summary: 'Admin: all reviews (any status), filter by doctorId/status, offset-paginated' })
  list(@Query() query: AdminListReviewsQueryDto): Promise<AdminReviewsResult> {
    return this.listAdminReviews.execute(query);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Patch('reviews/:reviewId/visibility')
  @HttpCode(200)
  @ApiOperation({ summary: 'Admin: hide or restore a review; the doctor rating aggregate is refreshed' })
  visibility(
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: SetReviewVisibilityDto,
  ): Promise<{ id: string; status: string }> {
    return this.setVisibility.execute(reviewId, dto.hidden);
  }
}
