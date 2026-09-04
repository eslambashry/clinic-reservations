import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { ResolveDoctorScopeUseCase } from '../../provider-directory/application/resolve-doctor-scope.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';

/** The two ways a caller can legitimately reach an appointment (File 11 05.5's auth line). */
export type AppointmentScope =
  | { kind: 'PATIENT'; patientUserId: string }
  | { kind: 'DOCTOR'; doctorId: string; affiliationIds: string[] };

/** Only the fields ownership actually depends on — deliberately not the whole row. */
export interface OwnableAppointment {
  patient_id: string;
  doctor_clinic_affiliation_id: string;
}

export function isAppointmentInScope(appointment: OwnableAppointment, scope: AppointmentScope): boolean {
  return scope.kind === 'PATIENT'
    ? appointment.patient_id === scope.patientUserId
    : scope.affiliationIds.includes(appointment.doctor_clinic_affiliation_id);
}

/**
 * File 12 Part 49.7 — resolves *what a caller may reach* before any
 * appointment row is read, so cancel/reschedule/list/detail all decide
 * ownership the same way instead of each re-deriving it.
 *
 * File 11 05.5 always specified appointment access as "the owning patient,
 * or clinic staff of the associated branch, or the doctor"; Part 35.8/35.14
 * implemented only the patient half and deferred the rest explicitly for
 * want of a doctor-scoped primitive. This closes that, for the DOCTOR half.
 * CLINIC_STAFF remains deferred — a `CLINIC_STAFF` membership carries a
 * `context_id` of the provisioning *doctor*, not a branch, so branch-scoped
 * staff access still needs a product decision about what a clinic assistant
 * may see, which is not this change's to make.
 *
 * Resolved outside the caller's transaction on purpose: it is an
 * authorization lookup against tables the transaction never writes, so
 * holding it inside would lengthen the write transaction for nothing (same
 * reasoning as `AuditService.listByResource`).
 */
@Injectable()
export class ResolveAppointmentScopeUseCase {
  constructor(@Inject(ResolveDoctorScopeUseCase) private readonly doctorScope: ResolveDoctorScopeUseCase) {}

  async execute(actor: AccessTokenPayload): Promise<AppointmentScope> {
    if (actor.contextType === RoleContextType.DOCTOR) {
      const scope = await this.doctorScope.execute(actor);
      return { kind: 'DOCTOR', doctorId: scope.doctorId, affiliationIds: scope.affiliationIds };
    }

    return { kind: 'PATIENT', patientUserId: actor.sub };
  }
}
