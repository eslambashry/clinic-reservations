import { Body, Controller, Inject, Post, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { CreatePharmacyOrderResult, CreatePharmacyOrderUseCase } from '../application/create-pharmacy-order.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { IdempotencyInterceptor } from '../../../shared/core/idempotency/idempotency-key.interceptor';
import { CreatePharmacyOrderDto } from './dto/create-pharmacy-order.dto';

/** File 11 Part 14/05 / File 12 Part 39 — patient-triggered order creation from an already-`ACCEPTED` prescription. */
@ApiTags('pharmacy-orders')
@ApiBearerAuth()
@Controller('pharmacy-orders')
export class PharmacyOrdersController {
  constructor(@Inject(CreatePharmacyOrderUseCase) private readonly createPharmacyOrder: CreatePharmacyOrderUseCase) {}

  @Roles(RoleContextType.PATIENT)
  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Create a pharmacy order from an ACCEPTED prescription and broadcast it to nearby verified branches (File 12 Part 39)' })
  create(@Body() dto: CreatePharmacyOrderDto, @CurrentUser() user: AccessTokenPayload): Promise<CreatePharmacyOrderResult> {
    return this.createPharmacyOrder.execute(dto, user);
  }
}
