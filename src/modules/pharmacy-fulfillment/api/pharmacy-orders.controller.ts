import { Controller, Body, Inject, Param, ParseUUIDPipe, Post, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { AcceptPharmacyOrderBroadcastResult, AcceptPharmacyOrderBroadcastUseCase } from '../application/accept-pharmacy-order-broadcast.use-case';
import { CreatePharmacyOrderResult, CreatePharmacyOrderUseCase } from '../application/create-pharmacy-order.use-case';
import { DeclinePharmacyOrderBroadcastResult, DeclinePharmacyOrderBroadcastUseCase } from '../application/decline-pharmacy-order-broadcast.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { IdempotencyInterceptor } from '../../../shared/core/idempotency/idempotency-key.interceptor';
import { CreatePharmacyOrderDto } from './dto/create-pharmacy-order.dto';

/**
 * File 11 Part 14/05 / File 12 Part 39 — patient-triggered order creation
 * from an already-`ACCEPTED` prescription, and pharmacy-staff broadcast
 * accept/decline. `accept`/`decline` take no `branchId` — it's resolved
 * server-side from the caller's own role membership (Part 39), so a
 * pharmacy-staff user can only ever act as their own branch.
 */
@ApiTags('pharmacy-orders')
@ApiBearerAuth()
@Controller('pharmacy-orders')
export class PharmacyOrdersController {
  constructor(
    @Inject(CreatePharmacyOrderUseCase) private readonly createPharmacyOrder: CreatePharmacyOrderUseCase,
    @Inject(AcceptPharmacyOrderBroadcastUseCase) private readonly acceptBroadcast: AcceptPharmacyOrderBroadcastUseCase,
    @Inject(DeclinePharmacyOrderBroadcastUseCase) private readonly declineBroadcast: DeclinePharmacyOrderBroadcastUseCase,
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
}
