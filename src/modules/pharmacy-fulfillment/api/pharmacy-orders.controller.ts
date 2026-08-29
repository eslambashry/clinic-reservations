import { Controller, Body, Get, Inject, Param, ParseUUIDPipe, Post, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { AcceptPharmacyOrderBroadcastResult, AcceptPharmacyOrderBroadcastUseCase } from '../application/accept-pharmacy-order-broadcast.use-case';
import { ApprovePharmacyOrderResult, ApprovePharmacyOrderUseCase } from '../application/approve-pharmacy-order.use-case';
import { CreatePharmacyOrderResult, CreatePharmacyOrderUseCase } from '../application/create-pharmacy-order.use-case';
import { DeclinePharmacyOrderBroadcastResult, DeclinePharmacyOrderBroadcastUseCase } from '../application/decline-pharmacy-order-broadcast.use-case';
import { GetPharmacyOrderUseCase, PharmacyOrderDetail } from '../application/get-pharmacy-order.use-case';
import { RejectPharmacyOrderSubstitutionResult, RejectPharmacyOrderSubstitutionUseCase } from '../application/reject-pharmacy-order-substitution.use-case';
import { SubmitPharmacyOrderQuoteResult, SubmitPharmacyOrderQuoteUseCase } from '../application/submit-pharmacy-order-quote.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { IdempotencyInterceptor } from '../../../shared/core/idempotency/idempotency-key.interceptor';
import { CreatePharmacyOrderDto } from './dto/create-pharmacy-order.dto';
import { SubmitPharmacyOrderQuoteDto } from './dto/submit-pharmacy-order-quote.dto';

/**
 * File 11 Part 14/05 / File 12 Part 39 — patient-triggered order creation
 * from an already-`ACCEPTED` prescription, pharmacy-staff broadcast
 * accept/decline, the pharmacist's quote, and the patient's decision on a
 * proposed substitution. `accept`/`decline`/`quote` take no `branchId` —
 * it's resolved server-side from the caller's own role membership (Part
 * 39), so a pharmacy-staff user can only ever act as their own branch.
 * `approve` (File 10 line 205) fuses substitution resolution with payment
 * capture in one call (File 10 Part 8.1, Part 39) — no `paymentMethod`
 * body, unlike appointments' `confirm`, since pay-at-clinic/pharmacy is the
 * only supported method (`DEC-001` still open).
 */
@ApiTags('pharmacy-orders')
@ApiBearerAuth()
@Controller('pharmacy-orders')
export class PharmacyOrdersController {
  constructor(
    @Inject(CreatePharmacyOrderUseCase) private readonly createPharmacyOrder: CreatePharmacyOrderUseCase,
    @Inject(AcceptPharmacyOrderBroadcastUseCase) private readonly acceptBroadcast: AcceptPharmacyOrderBroadcastUseCase,
    @Inject(DeclinePharmacyOrderBroadcastUseCase) private readonly declineBroadcast: DeclinePharmacyOrderBroadcastUseCase,
    @Inject(SubmitPharmacyOrderQuoteUseCase) private readonly submitQuote: SubmitPharmacyOrderQuoteUseCase,
    @Inject(RejectPharmacyOrderSubstitutionUseCase) private readonly rejectSubstitution: RejectPharmacyOrderSubstitutionUseCase,
    @Inject(ApprovePharmacyOrderUseCase) private readonly approvePharmacyOrder: ApprovePharmacyOrderUseCase,
    @Inject(GetPharmacyOrderUseCase) private readonly getPharmacyOrder: GetPharmacyOrderUseCase,
  ) {}

  @Roles(RoleContextType.PATIENT)
  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Create a pharmacy order from an ACCEPTED prescription and broadcast it to nearby verified branches (File 12 Part 39)' })
  create(@Body() dto: CreatePharmacyOrderDto, @CurrentUser() user: AccessTokenPayload): Promise<CreatePharmacyOrderResult> {
    return this.createPharmacyOrder.execute(dto, user);
  }

  @Roles(RoleContextType.PHARMACY_STAFF)
  @Post(':pharmacyOrderId/accept')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Accept a broadcast on behalf of the caller\'s own pharmacy branch — first-accept-wins (File 11 line 456)' })
  accept(
    @Param('pharmacyOrderId', ParseUUIDPipe) pharmacyOrderId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<AcceptPharmacyOrderBroadcastResult> {
    return this.acceptBroadcast.execute(pharmacyOrderId, user);
  }

  @Roles(RoleContextType.PHARMACY_STAFF)
  @Post(':pharmacyOrderId/decline')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Decline a broadcast on behalf of the caller\'s own pharmacy branch' })
  decline(
    @Param('pharmacyOrderId', ParseUUIDPipe) pharmacyOrderId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<DeclinePharmacyOrderBroadcastResult> {
    return this.declineBroadcast.execute(pharmacyOrderId, user);
  }

  @Roles(RoleContextType.PHARMACY_STAFF)
  @Post(':pharmacyOrderId/quote')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Submit item-by-item availability/substitution/pricing for an UNDER_REVIEW order (File 10 §2.3)' })
  quote(
    @Param('pharmacyOrderId', ParseUUIDPipe) pharmacyOrderId: string,
    @Body() dto: SubmitPharmacyOrderQuoteDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<SubmitPharmacyOrderQuoteResult> {
    return this.submitQuote.execute(pharmacyOrderId, dto, user);
  }

  @Roles(RoleContextType.PATIENT)
  @Post(':pharmacyOrderId/reject')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Reject a proposed substitution (File 11 Part 14: SUBSTITUTION_PROPOSED --> REJECTED)' })
  reject(
    @Param('pharmacyOrderId', ParseUUIDPipe) pharmacyOrderId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<RejectPharmacyOrderSubstitutionResult> {
    return this.rejectSubstitution.execute(pharmacyOrderId, user);
  }

  @Roles(RoleContextType.PATIENT)
  @Post(':pharmacyOrderId/approve')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Approve (resolving any pending substitution) and pay — the same moment, not decoupled (File 10 Part 8.1)' })
  approve(
    @Param('pharmacyOrderId', ParseUUIDPipe) pharmacyOrderId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ApprovePharmacyOrderResult> {
    return this.approvePharmacyOrder.execute(pharmacyOrderId, user);
  }

  @Roles(RoleContextType.PATIENT, RoleContextType.PHARMACY_STAFF)
  @Get(':pharmacyOrderId')
  @ApiOperation({ summary: 'Order detail — owning patient or the assigned pharmacy branch staff (File 11 05.8)' })
  get(@Param('pharmacyOrderId', ParseUUIDPipe) pharmacyOrderId: string, @CurrentUser() user: AccessTokenPayload): Promise<PharmacyOrderDetail> {
    return this.getPharmacyOrder.execute(pharmacyOrderId, user);
  }
}
