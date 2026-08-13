import { Module } from '@nestjs/common';
import { AffiliationsController } from './api/affiliations.controller';
import { ClinicBranchesController } from './api/clinic-branches.controller';
import { ClinicsController } from './api/clinics.controller';
import { DoctorsController } from './api/doctors.controller';
import { PharmacyBranchesController } from './api/pharmacy-branches.controller';
import { PharmaciesController } from './api/pharmacies.controller';
import { SpecialtiesController } from './api/specialties.controller';
import { VerificationDocumentsController } from './api/verification-documents.controller';
import { ApproveVerificationDocumentUseCase } from './application/approve-verification-document.use-case';
import { CreateAffiliationUseCase } from './application/create-affiliation.use-case';
import { CreateClinicBranchUseCase } from './application/create-clinic-branch.use-case';
import { CreateClinicUseCase } from './application/create-clinic.use-case';
import { CreateDoctorUseCase } from './application/create-doctor.use-case';
import { CreatePharmacyBranchUseCase } from './application/create-pharmacy-branch.use-case';
import { CreatePharmacyUseCase } from './application/create-pharmacy.use-case';
import { GetClinicBranchUseCase } from './application/get-clinic-branch.use-case';
import { GetClinicUseCase } from './application/get-clinic.use-case';
import { GetDoctorUseCase } from './application/get-doctor.use-case';
import { GetPharmacyBranchUseCase } from './application/get-pharmacy-branch.use-case';
import { GetPharmacyUseCase } from './application/get-pharmacy.use-case';
import { ListSchedulableAffiliationsUseCase } from './application/list-schedulable-affiliations.use-case';
import { ListSpecialtiesUseCase } from './application/list-specialties.use-case';
import { ListVerificationDocumentsUseCase } from './application/list-verification-documents.use-case';
import { RejectVerificationDocumentUseCase } from './application/reject-verification-document.use-case';
import { ResolveAffiliationForSchedulingUseCase } from './application/resolve-affiliation-for-scheduling.use-case';
import { SearchDoctorsUseCase } from './application/search-doctors.use-case';
import { SuspendClinicBranchUseCase } from './application/suspend-clinic-branch.use-case';
import { SuspendClinicUseCase } from './application/suspend-clinic.use-case';
import { SuspendDoctorUseCase } from './application/suspend-doctor.use-case';
import { SuspendPharmacyBranchUseCase } from './application/suspend-pharmacy-branch.use-case';
import { SuspendPharmacyUseCase } from './application/suspend-pharmacy.use-case';
import { UpdateAffiliationUseCase } from './application/update-affiliation.use-case';
import { UpdateClinicBranchUseCase } from './application/update-clinic-branch.use-case';
import { UpdateClinicUseCase } from './application/update-clinic.use-case';
import { UpdateDoctorUseCase } from './application/update-doctor.use-case';
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
import { SpecialtyRepository } from './infrastructure/specialty.repository';
import { VerificationDocumentRepository } from './infrastructure/verification-document.repository';
import { AuditModule } from '../audit/audit.module';

/**
 * File 11 Part 03: owns `doctors`, `clinics`, `clinic_branches`,
 * `doctor_clinic_affiliations`, `pharmacies`, `pharmacy_branches`,
 * `specialties`, `addresses`, `provider_verification_documents` — no other
 * module reaches into these tables directly (File 12 Part 05). File 12 Part
 * 33.3: `scheduling-appointments` now calls through this module's exported
 * use-cases (`ResolveAffiliationForSchedulingUseCase`/
 * `ListSchedulableAffiliationsUseCase`) to resolve a doctor/clinic-branch
 * pair and check visibility — never its `infrastructure/`.
 */
@Module({
  imports: [AuditModule],
  controllers: [
    DoctorsController,
    AffiliationsController,
    ClinicsController,
    ClinicBranchesController,
    PharmaciesController,
    PharmacyBranchesController,
    VerificationDocumentsController,
    SpecialtiesController,
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
    // application
    CreateDoctorUseCase,
    UpdateDoctorUseCase,
    VerifyDoctorUseCase,
    SuspendDoctorUseCase,
    GetDoctorUseCase,
    SearchDoctorsUseCase,
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
    CreateAffiliationUseCase,
    UpdateAffiliationUseCase,
    UploadVerificationDocumentUseCase,
    ListVerificationDocumentsUseCase,
    ApproveVerificationDocumentUseCase,
    RejectVerificationDocumentUseCase,
    ListSpecialtiesUseCase,
    ResolveAffiliationForSchedulingUseCase,
    ListSchedulableAffiliationsUseCase,
  ],
  exports: [ResolveAffiliationForSchedulingUseCase, ListSchedulableAffiliationsUseCase],
})
export class ProviderDirectoryModule {}
