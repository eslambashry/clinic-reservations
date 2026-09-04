import { Inject, Injectable } from '@nestjs/common';
import { AffiliationStatus, ProviderStatus } from '@prisma/client';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { DoctorScope, ResolveDoctorScopeUseCase } from './resolve-doctor-scope.use-case';

export interface MyDoctorClinicAddress {
  line1: string;
  city: string;
  regionCode: string;
  countryCode: string;
}

export interface MyDoctorClinic {
  affiliationId: string;
  affiliationStatus: AffiliationStatus;
  consultFee: string;
  currency: string;
  clinicId: string;
  clinicName: string;
  clinicStatus: ProviderStatus;
  clinicBranchId: string;
  branchStatus: ProviderStatus;
  phone: string;
  ianaTimezone: string;
  address: MyDoctorClinicAddress;
}

export interface ListMyDoctorClinicsResult {
  items: MyDoctorClinic[];
}

/**
 * `GET /v1/doctors/me/clinics` (File 12 Part 49.2) — the clinics and branches
 * the calling doctor is affiliated with. `doctorId` is never accepted from
 * the client; the scope comes from the JWT via `ResolveDoctorScopeUseCase`.
 *
 * Deliberate split between **sensitive/legal clinic data** and **operational
 * branch data** (Part 49.3): `Clinic.legal_name`, `Clinic.tax_id` and
 * `Clinic.verified_at` are not returned here at all — a doctor affiliated
 * with a clinic is not its legal operator. `clinicStatus`/`branchStatus` are
 * returned read-only because the dashboard must be able to explain *why* a
 * doctor's slots aren't being generated (an unverified/suspended branch is
 * the most common cause).
 */
@Injectable()
export class ListMyDoctorClinicsUseCase {
  constructor(@Inject(ResolveDoctorScopeUseCase) private readonly doctorScope: ResolveDoctorScopeUseCase) {}

  async execute(actor: AccessTokenPayload): Promise<ListMyDoctorClinicsResult> {
    const scope: DoctorScope = await this.doctorScope.execute(actor);

    return {
      items: scope.affiliations.map((affiliation) => ({
        affiliationId: affiliation.affiliationId,
        affiliationStatus: affiliation.affiliationStatus,
        consultFee: affiliation.consultFee,
        currency: affiliation.currency,
        clinicId: affiliation.clinicId,
        clinicName: affiliation.clinicName,
        clinicStatus: affiliation.clinicStatus,
        clinicBranchId: affiliation.clinicBranchId,
        branchStatus: affiliation.branchStatus,
        phone: affiliation.branchPhone,
        ianaTimezone: affiliation.ianaTimezone,
        address: {
          line1: affiliation.addressLine1,
          city: affiliation.addressCity,
          regionCode: affiliation.addressRegionCode,
          countryCode: affiliation.addressCountryCode,
        },
      })),
    };
  }
}
