import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { AddOperationalNoteUseCase } from '../application/add-operational-note.use-case';
import { CollectSampleUseCase } from '../application/collect-sample.use-case';
import { ConfirmLabBookingUseCase } from '../application/confirm-lab-booking.use-case';
import { CreateLabOrderUseCase } from '../application/create-lab-order.use-case';
import { DispatchCourierUseCase } from '../application/dispatch-courier.use-case';
import { GetLabOrderUseCase, LabOrderDetail } from '../application/get-lab-order.use-case';
import { ListLabOrdersResult, ListLabOrdersUseCase } from '../application/list-lab-orders.use-case';
import { RecordArrivalUseCase } from '../application/record-arrival.use-case';
import { RecordResultDeliveryUseCase } from '../application/record-result-delivery.use-case';
import { RecordResultUseCase } from '../application/record-result.use-case';
import { RejectLabOrderUseCase } from '../application/reject-lab-order.use-case';
import { RejectSampleUseCase } from '../application/reject-sample.use-case';
import { RequestRecollectionUseCase } from '../application/request-recollection.use-case';
import { RescheduleVisitUseCase } from '../application/reschedule-visit.use-case';
import { SetCriticalFlagUseCase } from '../application/set-critical-flag.use-case';
import { StartAnalysisUseCase } from '../application/start-analysis.use-case';
import { SubmitLabQuoteUseCase } from '../application/submit-lab-quote.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { IdempotencyInterceptor } from '../../../shared/core/idempotency/idempotency-key.interceptor';
import { AddNoteDto } from './dto/add-note.dto';
import { CreateLabOrderDto } from './dto/create-lab-order.dto';
import { LifecycleNoteDto } from './dto/lifecycle-note.dto';
import { ListLabOrdersQueryDto } from './dto/list-lab-orders-query.dto';
import { RecordResultDeliveryDto } from './dto/record-result-delivery.dto';
import { RecordResultDto } from './dto/record-result.dto';
import { RejectLabOrderDto } from './dto/reject-lab-order.dto';
import { RejectSampleDto } from './dto/reject-sample.dto';
import { RequestRecollectionDto } from './dto/request-recollection.dto';
import { RescheduleVisitDto } from './dto/reschedule-visit.dto';
import { SetCriticalFlagDto } from './dto/set-critical-flag.dto';
import { StartAnalysisDto } from './dto/start-analysis.dto';
import { SubmitLabQuoteDto } from './dto/submit-lab-quote.dto';

/**
 * Laboratory module (File 12 Part 47, 2026-09-02) — un-postponed, built
 * directly against `medsuper-laboratory-dashboard`'s own already-complete
 * contract (`src/lib/api/types.ts`/`service.ts`), the only authoritative
 * source at un-postpone time (no File 10/11 spec exists for this domain).
 * `PATIENT`/`LAB_STAFF` roles per route, branch resolved server-side from
 * the caller's own role membership — never a request parameter, same
 * convention `pharmacy-fulfillment` established.
 */
@ApiTags('lab-orders')
@ApiBearerAuth()
@Controller('lab-orders')
export class LabOrdersController {
  constructor(
    @Inject(CreateLabOrderUseCase) private readonly createLabOrder: CreateLabOrderUseCase,
    @Inject(ListLabOrdersUseCase) private readonly listLabOrders: ListLabOrdersUseCase,
    @Inject(GetLabOrderUseCase) private readonly getLabOrder: GetLabOrderUseCase,
    @Inject(SubmitLabQuoteUseCase) private readonly submitQuote: SubmitLabQuoteUseCase,
    @Inject(ConfirmLabBookingUseCase) private readonly confirmBooking: ConfirmLabBookingUseCase,
    @Inject(RecordArrivalUseCase) private readonly recordArrival: RecordArrivalUseCase,
    @Inject(DispatchCourierUseCase) private readonly dispatchCourier: DispatchCourierUseCase,
    @Inject(CollectSampleUseCase) private readonly collectSample: CollectSampleUseCase,
    @Inject(RescheduleVisitUseCase) private readonly rescheduleVisit: RescheduleVisitUseCase,
    @Inject(StartAnalysisUseCase) private readonly startAnalysis: StartAnalysisUseCase,
    @Inject(RecordResultUseCase) private readonly recordResult: RecordResultUseCase,
    @Inject(SetCriticalFlagUseCase) private readonly setCriticalFlag: SetCriticalFlagUseCase,
    @Inject(RejectSampleUseCase) private readonly rejectSample: RejectSampleUseCase,
    @Inject(RequestRecollectionUseCase) private readonly requestRecollection: RequestRecollectionUseCase,
    @Inject(RejectLabOrderUseCase) private readonly rejectLabOrder: RejectLabOrderUseCase,
    @Inject(AddOperationalNoteUseCase) private readonly addOperationalNote: AddOperationalNoteUseCase,
    @Inject(RecordResultDeliveryUseCase) private readonly recordResultDelivery: RecordResultDeliveryUseCase,
  ) {}

  @Roles(RoleContextType.PATIENT, RoleContextType.LAB_STAFF)
  @Get()
  @ApiOperation({ summary: "The caller's own orders (PATIENT) or their branch's full queue (LAB_STAFF)" })
  list(@Query() query: ListLabOrdersQueryDto, @CurrentUser() user: AccessTokenPayload): Promise<ListLabOrdersResult> {
    return this.listLabOrders.execute(query, user);
  }

  @Roles(RoleContextType.PATIENT)
  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Create a lab order — direct catalog-test selection and/or an uploaded prescription, assigned to one chosen branch' })
  create(@Body() dto: CreateLabOrderDto, @CurrentUser() user: AccessTokenPayload) {
    return this.createLabOrder.execute(dto, user);
  }

  @Roles(RoleContextType.PATIENT, RoleContextType.LAB_STAFF)
  @Get(':labOrderId')
  @ApiOperation({ summary: 'Order detail — owning patient or the assigned lab branch staff' })
  get(@Param('labOrderId', ParseUUIDPipe) labOrderId: string, @CurrentUser() user: AccessTokenPayload): Promise<LabOrderDetail> {
    return this.getLabOrder.execute(labOrderId, user);
  }

  @Roles(RoleContextType.LAB_STAFF)
  @Post(':labOrderId/quote')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'REQUESTED --> QUOTED: price, appointment, prep instructions, and the queue slot for the day' })
  quote(@Param('labOrderId', ParseUUIDPipe) labOrderId: string, @Body() dto: SubmitLabQuoteDto, @CurrentUser() user: AccessTokenPayload) {
    return this.submitQuote.execute(labOrderId, dto, user);
  }

  @Roles(RoleContextType.LAB_STAFF)
  @Post(':labOrderId/confirm-booking')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'QUOTED --> AWAITING_SAMPLE, issuing a booking code (2026-09-02 addition — implements the dormant BOOKING_CONFIRMED transition)' })
  confirm(@Param('labOrderId', ParseUUIDPipe) labOrderId: string, @CurrentUser() user: AccessTokenPayload) {
    return this.confirmBooking.execute(labOrderId, user);
  }

  @Roles(RoleContextType.LAB_STAFF)
  @Post(':labOrderId/arrival')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Patient physically arrived — VISIT orders only' })
  arrival(@Param('labOrderId', ParseUUIDPipe) labOrderId: string, @Body() dto: LifecycleNoteDto, @CurrentUser() user: AccessTokenPayload) {
    return this.recordArrival.execute(labOrderId, dto, user);
  }

  @Roles(RoleContextType.LAB_STAFF)
  @Post(':labOrderId/dispatch-courier')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Courier dispatched — HOME_COLLECTION orders only (File 10 §3.3)' })
  dispatch(@Param('labOrderId', ParseUUIDPipe) labOrderId: string, @Body() dto: LifecycleNoteDto, @CurrentUser() user: AccessTokenPayload) {
    return this.dispatchCourier.execute(labOrderId, dto, user);
  }

  @Roles(RoleContextType.LAB_STAFF)
  @Post(':labOrderId/collect-sample')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Sample collected — requires the arrival/courier gate satisfied and no already-live sample' })
  collect(@Param('labOrderId', ParseUUIDPipe) labOrderId: string, @Body() dto: LifecycleNoteDto, @CurrentUser() user: AccessTokenPayload) {
    return this.collectSample.execute(labOrderId, dto, user);
  }

  @Roles(RoleContextType.LAB_STAFF)
  @Post(':labOrderId/reschedule')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Move the appointment — QUOTED/AWAITING_SAMPLE only, and only before a sample is collected (SPECULATIVE addition, dashboard docs §4)' })
  reschedule(@Param('labOrderId', ParseUUIDPipe) labOrderId: string, @Body() dto: RescheduleVisitDto, @CurrentUser() user: AccessTokenPayload) {
    return this.rescheduleVisit.execute(labOrderId, dto, user);
  }

  @Roles(RoleContextType.LAB_STAFF)
  @Post(':labOrderId/start-analysis')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'AWAITING_SAMPLE --> IN_ANALYSIS, requires a live sample' })
  startAnalysisRoute(@Param('labOrderId', ParseUUIDPipe) labOrderId: string, @Body() dto: StartAnalysisDto, @CurrentUser() user: AccessTokenPayload) {
    return this.startAnalysis.execute(labOrderId, dto, user);
  }

  @Roles(RoleContextType.LAB_STAFF)
  @Post(':labOrderId/results')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Record one result document — per-item (flips to RESULTS_READY once every item is recorded) or, for a freeform order with no registered items, order-level (flips immediately)' })
  results(@Param('labOrderId', ParseUUIDPipe) labOrderId: string, @Body() dto: RecordResultDto, @CurrentUser() user: AccessTokenPayload) {
    return this.recordResult.execute(labOrderId, dto, user);
  }

  @Roles(RoleContextType.LAB_STAFF)
  @Post(':labOrderId/results/:resultId/critical-flag')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'The human critical/non-critical call — one-shot per result (DEC-003)' })
  criticalFlag(
    @Param('labOrderId', ParseUUIDPipe) labOrderId: string,
    @Param('resultId', ParseUUIDPipe) resultId: string,
    @Body() dto: SetCriticalFlagDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.setCriticalFlag.execute(labOrderId, resultId, dto, user);
  }

  @Roles(RoleContextType.LAB_STAFF)
  @Post(':labOrderId/reject-sample')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Invalidate the current sample and every result recorded against it; sets recollection_required' })
  rejectSampleRoute(@Param('labOrderId', ParseUUIDPipe) labOrderId: string, @Body() dto: RejectSampleDto, @CurrentUser() user: AccessTokenPayload) {
    return this.rejectSample.execute(labOrderId, dto, user);
  }

  @Roles(RoleContextType.LAB_STAFF)
  @Post(':labOrderId/request-recollection')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Applies only to a rejected-sample hold' })
  requestRecollectionRoute(@Param('labOrderId', ParseUUIDPipe) labOrderId: string, @Body() dto: RequestRecollectionDto, @CurrentUser() user: AccessTokenPayload) {
    return this.requestRecollection.execute(labOrderId, dto, user);
  }

  @Roles(RoleContextType.LAB_STAFF)
  @Post(':labOrderId/reject')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Whole-order reject — blocked once analysis started, terminal, or a live sample exists' })
  reject(@Param('labOrderId', ParseUUIDPipe) labOrderId: string, @Body() dto: RejectLabOrderDto, @CurrentUser() user: AccessTokenPayload) {
    return this.rejectLabOrder.execute(labOrderId, dto, user);
  }

  @Roles(RoleContextType.LAB_STAFF)
  @Post(':labOrderId/notes')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Free-text operational note' })
  addNote(@Param('labOrderId', ParseUUIDPipe) labOrderId: string, @Body() dto: AddNoteDto, @CurrentUser() user: AccessTokenPayload) {
    return this.addOperationalNote.execute(labOrderId, dto, user);
  }

  @Roles(RoleContextType.LAB_STAFF)
  @Post(':labOrderId/record-delivery')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Staff self-attestation that results were handed off — never a system-claimed send (DEC-004)' })
  recordDelivery(@Param('labOrderId', ParseUUIDPipe) labOrderId: string, @Body() dto: RecordResultDeliveryDto, @CurrentUser() user: AccessTokenPayload) {
    return this.recordResultDelivery.execute(labOrderId, dto, user);
  }
}
