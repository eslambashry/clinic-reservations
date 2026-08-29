import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { AcceptPharmacyOrderBroadcastResult, AcceptPharmacyOrderBroadcastUseCase } from '../application/accept-pharmacy-order-broadcast.use-case';
import { ApprovePharmacyOrderResult, ApprovePharmacyOrderUseCase } from '../application/approve-pharmacy-order.use-case';
import { CompletePharmacyOrderResult, CompletePharmacyOrderUseCase } from '../application/complete-pharmacy-order.use-case';
import { CreatePharmacyOrderResult, CreatePharmacyOrderUseCase } from '../application/create-pharmacy-order.use-case';
import { DeclinePharmacyOrderBroadcastResult, DeclinePharmacyOrderBroadcastUseCase } from '../application/decline-pharmacy-order-broadcast.use-case';
import { FulfillPharmacyOrderResult, FulfillPharmacyOrderUseCase } from '../application/fulfill-pharmacy-order.use-case';
import { GetPharmacyOrderUseCase, PharmacyOrderDetail } from '../application/get-pharmacy-order.use-case';
import { ListPharmacyOrdersResult, ListPharmacyOrdersUseCase } from '../application/list-pharmacy-orders.use-case';
import { RejectPharmacyOrderResult, RejectPharmacyOrderUseCase } from '../application/reject-pharmacy-order.use-case';
import { RejectPharmacyOrderSubstitutionResult, RejectPharmacyOrderSubstitutionUseCase } from '../application/reject-pharmacy-order-substitution.use-case';
import { SubmitPharmacyOrderQuoteResult, SubmitPharmacyOrderQuoteUseCase } from '../application/submit-pharmacy-order-quote.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { IdempotencyInterceptor } from '../../../shared/core/idempotency/idempotency-key.interceptor';
import { CreatePharmacyOrderDto } from './dto/create-pharmacy-order.dto';
import { LifecycleTransitionDto } from './dto/lifecycle-transition.dto';
import { ListPharmacyOrdersQueryDto } from './dto/list-pharmacy-orders-query.dto';
import { RejectPharmacyOrderDto } from './dto/reject-pharmacy-order.dto';
import { SubmitPharmacyOrderQuoteDto } from './dto/submit-pharmacy-order-quote.dto';

/**
 * File 11 Part 14/05 / File 12 Part 39 — patient-triggered order creation
 * from an already-`ACCEPTED` prescription, pharmacy-staff broadcast
 * accept/decline, the pharmacist's quote, and the patient's approval/payment.
 * `accept`/`decline`/`quote`/`fulfill`/`complete` take no `branchId` — it's
 * resolved server-side from the caller's own role membership (Part 39), so a
 * pharmacy-staff user can only ever act as their own branch.
 *
 * 2026-08-29 additions (`medsuper-pharmacy-dashboard` integration pass):
 * `GET /` (the queue-listing endpoint File 12 Part 39 item 11 named but
 * never built), `POST /:id/fulfill` and `POST /:id/complete` (post-payment
 * progression, previously entirely missing), and `quote`'s body is now a
 * flat total instead of File 10's item-by-item contract (see
 * `submit-pharmacy-order-quote.use-case.ts`). The dashboard's UI never had a
 * separate "accept this broadcast" screen, so `quote`/`reject` (PHARMACY_STAFF)
 * now fold the accept/decline decision in: quoting an unclaimed order claims
 * it first; rejecting one with an unresponded broadcast declines it instead
 * of a whole-order reject. `accept`/`decline` stay as documented,
 * separately-callable primitives, just unused by this console. `reject` is
 * additionally dual-purpose by actor: a `PATIENT` caller still rejects a
 * proposed substitution (practically unreachable now that quoting can't
 * produce one, kept for forward-compat).
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
    @Inject(RejectPharmacyOrderUseCase) private readonly rejectOrder: RejectPharmacyOrderUseCase,
    @Inject(RejectPharmacyOrderSubstitutionUseCase) private readonly rejectSubstitution: RejectPharmacyOrderSubstitutionUseCase,
    @Inject(ApprovePharmacyOrderUseCase) private readonly approvePharmacyOrder: ApprovePharmacyOrderUseCase,
    @Inject(FulfillPharmacyOrderUseCase) private readonly fulfillPharmacyOrder: FulfillPharmacyOrderUseCase,
    @Inject(CompletePharmacyOrderUseCase) private readonly completePharmacyOrder: CompletePharmacyOrderUseCase,
    @Inject(ListPharmacyOrdersUseCase) private readonly listPharmacyOrders: ListPharmacyOrdersUseCase,
    @Inject(GetPharmacyOrderUseCase) private readonly getPharmacyOrder: GetPharmacyOrderUseCase,
  ) {}

  @Roles(RoleContextType.PATIENT, RoleContextType.PHARMACY_STAFF)
  @Get()
  @ApiOperation({ summary: "The caller's own orders (PATIENT) or their branch's queue — claimed orders plus incoming, unanswered broadcasts (PHARMACY_STAFF)" })
  list(@Query() query: ListPharmacyOrdersQueryDto, @CurrentUser() user: AccessTokenPayload): Promise<ListPharmacyOrdersResult> {
    return this.listPharmacyOrders.execute(query, user);
  }

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
  @ApiOperation({
    summary:
      'Submit a flat total/ETA/note — no per-item pricing. Claims an unclaimed RECEIVED order first if needed (2026-08-29, docs/PROPOSED_CONTRACT.md §1)',
  })
  quote(
    @Param('pharmacyOrderId', ParseUUIDPipe) pharmacyOrderId: string,
    @Body() dto: SubmitPharmacyOrderQuoteDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<SubmitPharmacyOrderQuoteResult> {
    return this.submitQuote.execute(pharmacyOrderId, dto, user);
  }

  @Roles(RoleContextType.PATIENT, RoleContextType.PHARMACY_STAFF)
  @Post(':pharmacyOrderId/reject')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary:
      'PHARMACY_STAFF: declines an unresponded broadcast, or rejects the whole claimed order (reason/note required) if already UNDER_REVIEW. PATIENT: reject a proposed substitution (no body, forward-compat only).',
  })
  reject(
    @Param('pharmacyOrderId', ParseUUIDPipe) pharmacyOrderId: string,
    @Body() dto: RejectPharmacyOrderDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<RejectPharmacyOrderResult | RejectPharmacyOrderSubstitutionResult> {
    if (user.contextType === RoleContextType.PHARMACY_STAFF) {
      return this.rejectOrder.execute(pharmacyOrderId, dto, user);
    }
    return this.rejectSubstitution.execute(pharmacyOrderId, user);
  }

  @Roles(RoleContextType.PATIENT)
  @Post(':pharmacyOrderId/approve')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Approve and pay — the same moment, not decoupled (File 10 Part 8.1)' })
  approve(
    @Param('pharmacyOrderId', ParseUUIDPipe) pharmacyOrderId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ApprovePharmacyOrderResult> {
    return this.approvePharmacyOrder.execute(pharmacyOrderId, user);
  }

  @Roles(RoleContextType.PHARMACY_STAFF)
  @Post(':pharmacyOrderId/fulfill')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'PAID --> READY_FOR_PICKUP or OUT_FOR_DELIVERY, by the order\'s own fulfillment type (2026-08-29 addition)' })
  fulfill(
    @Param('pharmacyOrderId', ParseUUIDPipe) pharmacyOrderId: string,
    @Body() _dto: LifecycleTransitionDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<FulfillPharmacyOrderResult> {
    return this.fulfillPharmacyOrder.execute(pharmacyOrderId, user);
  }

  @Roles(RoleContextType.PHARMACY_STAFF)
  @Post(':pharmacyOrderId/complete')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'READY_FOR_PICKUP or OUT_FOR_DELIVERY --> FULFILLED, the terminal close (2026-08-29 addition)' })
  complete(
    @Param('pharmacyOrderId', ParseUUIDPipe) pharmacyOrderId: string,
    @Body() _dto: LifecycleTransitionDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<CompletePharmacyOrderResult> {
    return this.completePharmacyOrder.execute(pharmacyOrderId, user);
  }

  @Roles(RoleContextType.PATIENT, RoleContextType.PHARMACY_STAFF)
  @Get(':pharmacyOrderId')
  @ApiOperation({ summary: 'Order detail — owning patient or the assigned pharmacy branch staff (File 11 05.8)' })
  get(@Param('pharmacyOrderId', ParseUUIDPipe) pharmacyOrderId: string, @CurrentUser() user: AccessTokenPayload): Promise<PharmacyOrderDetail> {
    return this.getPharmacyOrder.execute(pharmacyOrderId, user);
  }
}
