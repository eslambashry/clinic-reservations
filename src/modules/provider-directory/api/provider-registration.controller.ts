import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetMyDoctorRegistrationStatusUseCase, MyDoctorRegistrationStatusResult } from '../application/get-my-doctor-registration-status.use-case';
import { ListSpecialtiesUseCase } from '../application/list-specialties.use-case';
import { SelfRegisterProviderResult, SelfRegisterProviderUseCase } from '../application/self-register-provider.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { SubmitProviderRegistrationDto } from './dto/submit-provider-registration.dto';

interface LookupItem {
  id: string;
  label: string;
}

interface RegistrationLookups {
  specialties: LookupItem[];
  cities: LookupItem[];
}

/**
 * ADR-005 (`docs/decisions/ADR-005-PROVIDER-SELF-REGISTRATION.md`, FILE_12
 * Part 34): authenticated (any role) intake surface matching the Flutter
 * `provider_registration` feature's existing request shape — deliberately
 * separate from `DoctorsController`/`ClinicsController`, which stay
 * `@Roles(ADMIN)`-only per Part 32 unchanged.
 */
@ApiTags('provider-registration')
@ApiBearerAuth()
@Controller('provider/registration')
export class ProviderRegistrationController {
  constructor(
    @Inject(SelfRegisterProviderUseCase) private readonly selfRegisterProvider: SelfRegisterProviderUseCase,
    @Inject(ListSpecialtiesUseCase) private readonly listSpecialties: ListSpecialtiesUseCase,
    @Inject(GetMyDoctorRegistrationStatusUseCase) private readonly getMyStatus: GetMyDoctorRegistrationStatusUseCase,
  ) {}

  @Get('lookups')
  @ApiOperation({ summary: 'Form dropdown data. `cities` is always empty — no cities/regions table exists yet (ADR-005).' })
  async lookups(): Promise<RegistrationLookups> {
    const specialties = await this.listSpecialties.execute();
    return {
      // English-first: no content-negotiation exists anywhere else in this API to justify picking name_ar here.
      specialties: specialties.map((specialty) => ({ id: specialty.code, label: specialty.name_en })),
      cities: [],
    };
  }

  @Post()
  @ApiOperation({ summary: 'Submit a provider application — creates PENDING records, still requires Admin verify (ADR-005).' })
  submit(
    @Body() dto: SubmitProviderRegistrationDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<SelfRegisterProviderResult> {
    return this.selfRegisterProvider.execute(dto, user);
  }

  @Get('status')
  @ApiOperation({
    summary:
      "The caller's own doctor registration status (PENDING/VERIFIED/SUSPENDED) — lets a self-registered applicant poll their own approval state, since their role membership stays PATIENT until an Admin verifies them and GET /v1/doctors/:doctorId 404s for a non-Admin caller while PENDING.",
  })
  status(@CurrentUser() user: AccessTokenPayload): Promise<MyDoctorRegistrationStatusResult> {
    return this.getMyStatus.execute(user);
  }
}
