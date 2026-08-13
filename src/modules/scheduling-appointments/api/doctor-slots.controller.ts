import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetDoctorSlotsResult, GetDoctorSlotsUseCase } from '../application/get-doctor-slots.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { OptionalAuth } from '../../../shared/core/auth/optional-auth.decorator';
import { GetDoctorSlotsQueryDto } from './dto/get-doctor-slots-query.dto';

/**
 * File 10 §2.3 / File 12 Part 33.15: public (`@OptionalAuth()`), same
 * visibility-bypass pattern as Phase 2's doctor search/detail — an Admin
 * token can review a not-yet-verified doctor's configured schedule.
 */
@ApiTags('doctors')
@Controller('doctors')
export class DoctorSlotsController {
  constructor(private readonly getDoctorSlots: GetDoctorSlotsUseCase) {}

  @OptionalAuth()
  @Get(':doctorId/slots')
  @ApiOperation({ summary: 'Public: OPEN appointment slots for a doctor at one clinic branch, UTC, max 14-day window' })
  get(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
    @Query() query: GetDoctorSlotsQueryDto,
    @CurrentUser() user: AccessTokenPayload | undefined,
  ): Promise<GetDoctorSlotsResult> {
    return this.getDoctorSlots.execute(doctorId, query.clinicBranchId, query.from, query.to, user?.contextType);
  }
}
