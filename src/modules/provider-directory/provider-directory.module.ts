import { Module } from '@nestjs/common';
import { AffiliationsController } from './api/affiliations.controller';
import { AssistantsController } from './api/assistants.controller';
import { ClinicBranchesController } from './api/clinic-branches.controller';
import { DoctorClinicsController } from './api/doctor-clinics.controller';
import { ClinicsController } from './api/clinics.controller';
import { DoctorsController } from './api/doctors.controller';
import { PharmacyBranchesController } from './api/pharmacy-branches.controller';
import { PharmaciesController } from './api/pharmacies.controller';
import { ProviderRegistrationController } from './api/provider-registration.controller';
import { SpecialtiesController } from './api/specialties.controller';
import { VerificationDocumentsController } from './api/verification-documents.controller';
import { ApproveVerificationDocumentUseCase } from './application/approve-verification-document.use-case';
import { CreateAffiliationUseCase } from './application/create-affiliation.use-case';
import { CreateAssistantUseCase } from './application/create-assistant.use-case';
import { CreateClinicBranchUseCase } from './application/create-clinic-branch.use-case';
import { CreateClinicUseCase } from './application/create-clinic.use-case';
import { CreateDoctorUseCase } from './application/create-doctor.use-case';
import { DeleteAssistantUseCase } from './application/delete-assistant.use-case';
import { CreatePharmacyBranchUseCase } from './application/create-pharmacy-branch.use-case';
import { CreatePharmacyUseCase } from './application/create-pharmacy.use-case';
import { GetAffiliationBillingInfoUseCase } from './application/get-affiliation-billing-info.use-case';
import { GetClinicBranchUseCase } from './application/get-clinic-branch.use-case';
import { GetClinicUseCase } from './application/get-clinic.use-case';
import { GetDoctorUseCase } from './application/get-doctor.use-case';
import { GetMyDoctorRegistrationStatusUseCase } from './application/get-my-doctor-registration-status.use-case';
import { GetMyDoctorProfileUseCase } from './application/get-my-doctor-profile.use-case';
import { GetPharmacyBranchUseCase } from './application/get-pharmacy-branch.use-case';
import { GetPharmacyUseCase } from './application/get-pharmacy.use-case';
import { ListAssistantsUseCase } from './application/list-assistants.use-case';
import { ListDoctorsUseCase } from './application/list-doctors.use-case';
import { ListMyDoctorClinicsUseCase } from './application/list-my-doctor-clinics.use-case';
import { ListSchedulableAffiliationsUseCase } from './application/list-schedulable-affiliations.use-case';
import { ListSpecialtiesUseCase } from './application/list-specialties.use-case';
import { ListVerificationDocumentsUseCase } from './application/list-verification-documents.use-case';
import { RejectVerificationDocumentUseCase } from './application/reject-verification-document.use-case';
import { ResolveAffiliationForSchedulingUseCase } from './application/resolve-affiliation-for-scheduling.use-case';
import { ResolveDoctorScopeUseCase } from './application/resolve-doctor-scope.use-case';
import { SearchDoctorsUseCase } from './application/search-doctors.use-case';
import { SearchPharmacyBranchesUseCase } from './application/search-pharmacy-branches.use-case';
import { SelfRegisterProviderUseCase } from './application/self-register-provider.use-case';
import { SuspendClinicBranchUseCase } from './application/suspend-clinic-branch.use-case';
import { SuspendClinicUseCase } from './application/suspend-clinic.use-case';
import { SuspendDoctorUseCase } from './application/suspend-doctor.use-case';
import { SuspendPharmacyBranchUseCase } from './application/suspend-pharmacy-branch.use-case';
import { SuspendPharmacyUseCase } from './application/suspend-pharmacy.use-case';
import { UpdateAffiliationUseCase } from './application/update-affiliation.use-case';
import { UpdateAssistantUseCase } from './application/update-assistant.use-case';
import { UpdateClinicBranchUseCase } from './application/update-clinic-branch.use-case';
import { UpdateClinicUseCase } from './application/update-clinic.use-case';
import { UpdateDoctorUseCase } from './application/update-doctor.use-case';
import { UpdateMyAffiliationUseCase } from './application/update-my-affiliation.use-case';
import { UpdateMyClinicBranchUseCase } from './application/update-my-clinic-branch.use-case';
import { UpdateMyDoctorProfileUseCase } from './application/update-my-doctor-profile.use-case';
import { UpdatePharmacyBranchUseCase } from './application/update-pharmacy-branch.use-case';
import { UpdatePharmacyUseCase } from './application/update-pharmacy.use-case';
import { UploadVerificationDocumentUseCase } from './application/upload-verification-document.use-case';
import { VerifyClinicBranchUseCase } from './application/verify-clinic-branch.use-case';
import { VerifyClinicUseCase } from './application/verify-clinic.use-case';
import { VerifyDoctorUseCase } from './application/verify-doctor.use-case';
import { VerifyPharmacyBranchUseCase } from './application/verify-pharmacy-branch.use-case';
import { VerifyPharmacyUseCase } from './application/verify-pharmacy.use-case';
import { AddressRepository } from './infrastructure/address.repository';
import { AffiliationRepository } from './infrastructure/affiliation.repository';
import { ClinicRepository } from './infrastructure/clinic.repository';
import { ClinicBranchRepository } from './infrastructure/clinic-branch.repository';
import { DoctorRepository } from './infrastructure/doctor.repository';
import { DoctorSearchRepository } from './infrastructure/doctor-search.repository';
import { PharmacyRepository } from './infrastructure/pharmacy.repository';
import { PharmacyBranchRepository } from './infrastructure/pharmacy-branch.repository';
import { PharmacyBranchSearchRepository } from './infrastructure/pharmacy-branch-search.repository';
import { SpecialtyRepository } from './infrastructure/specialty.repository';
import { VerificationDocumentRepository } from './infrastructure/verification-document.repository';
import { AuditModule } from '../audit/audit.module';
import { IdentityAuthModule } from '../identity-auth/identity-auth.module';
import { ScheduleTemplateRepository } from '../scheduling-appointments/infrastructure/schedule-template.repository';

/**
 * File 11 Part 03: owns `doctors`, `clinics`, `clinic_branches`,
 * `doctor_clinic_affiliations`, `pharmacies`, `pharmacy_branches`,
 * `specialties`, `addresses`, `provider_verification_documents` — no other
 * module reaches into these tables directly (File 12 Part 05). File 12 Part
 * 33.3: `scheduling-appointments` now calls through this module's exported
 * use-cases (`ResolveAffiliationForSchedulingUseCase`/
 * `ListSchedulableAffiliationsUseCase`) to resolve a doctor/clinic-branch
 * pair and check visibility — never its `infrastructure/`. File 12 Part
 * 36.3 adds a third export, `GetAffiliationBillingInfoUseCase`, used by
 * `payments` to read an affiliation's consult fee inside its own transaction.
 * File 12 Part 39.2 adds a fourth, `SearchPharmacyBranchesUseCase`, reused
 * as-is by `pharmacy-fulfillment` for broadcast-target selection.
 * `ScheduleTemplateRepository` is registered here too (not imported via
 * `SchedulingAppointmentsModule`, which itself imports this module — that
 * would be circular): `SelfRegisterProviderUseCase` needs it to persist
 * `working_days` as real `ScheduleTemplate` rows inside its own transaction,
 * scoped to the affiliation it just created, not a cross-module query.
 */
@Module({
  imports: [AuditModule, IdentityAuthModule],
  controllers: [
    DoctorsController,
    AffiliationsController,
    ClinicsController,
    ClinicBranchesController,
    DoctorClinicsController,
    PharmaciesController,
    PharmacyBranchesController,
    VerificationDocumentsController,
    SpecialtiesController,
    ProviderRegistrationController,
    AssistantsController,
  ],
  providers: [
    // infrastructure
    SpecialtyRepository,
    AddressRepository,
    DoctorRepository,
    ClinicRepository,
    ClinicBranchRepository,
    PharmacyRepository,
    PharmacyBranchRepository,
    AffiliationRepository,
    VerificationDocumentRepository,
    DoctorSearchRepository,
    PharmacyBranchSearchRepository,
    ScheduleTemplateRepository,
    // application
    CreateDoctorUseCase,
    UpdateDoctorUseCase,
    VerifyDoctorUseCase,
    SuspendDoctorUseCase,
    GetDoctorUseCase,
    GetMyDoctorProfileUseCase,
    UpdateMyDoctorProfileUseCase,
    SearchDoctorsUseCase,
    ListDoctorsUseCase,
    CreateClinicUseCase,
    UpdateClinicUseCase,
    VerifyClinicUseCase,
    SuspendClinicUseCase,
    GetClinicUseCase,
    CreateClinicBranchUseCase,
    UpdateClinicBranchUseCase,
    VerifyClinicBranchUseCase,
    SuspendClinicBranchUseCase,
    GetClinicBranchUseCase,
    CreatePharmacyUseCase,
    UpdatePharmacyUseCase,
    VerifyPharmacyUseCase,
    SuspendPharmacyUseCase,
    GetPharmacyUseCase,
    CreatePharmacyBranchUseCase,
    UpdatePharmacyBranchUseCase,
    VerifyPharmacyBranchUseCase,
    SuspendPharmacyBranchUseCase,
    GetPharmacyBranchUseCase,
    SearchPharmacyBranchesUseCase,
    CreateAffiliationUseCase,
    UpdateAffiliationUseCase,
    UploadVerificationDocumentUseCase,
    ListVerificationDocumentsUseCase,
    ApproveVerificationDocumentUseCase,
    RejectVerificationDocumentUseCase,
    ListSpecialtiesUseCase,
    ResolveAffiliationForSchedulingUseCase,
    ListSchedulableAffiliationsUseCase,
    SelfRegisterProviderUseCase,
    GetMyDoctorRegistrationStatusUseCase,
    GetAffiliationBillingInfoUseCase,
    ListAssistantsUseCase,
    CreateAssistantUseCase,
    UpdateAssistantUseCase,
    DeleteAssistantUseCase,
    ResolveDoctorScopeUseCase,
    ListMyDoctorClinicsUseCase,
    UpdateMyClinicBranchUseCase,
    UpdateMyAffiliationUseCase,
  ],
  exports: [
    ResolveAffiliationForSchedulingUseCase,
    ListSchedulableAffiliationsUseCase,
    GetAffiliationBillingInfoUseCase,
    SearchPharmacyBranchesUseCase,
    GetPharmacyBranchUseCase,
    // File 12 Part 49.1: the doctor-scoped ownership primitive, consumed by
    // `scheduling-appointments` for schedule-template and appointment
    // ownership checks — never its `infrastructure/`.
    ResolveDoctorScopeUseCase,
  ],
})
export class ProviderDirectoryModule {}
