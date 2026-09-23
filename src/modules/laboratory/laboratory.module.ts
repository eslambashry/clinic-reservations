import { Module } from '@nestjs/common';
import { LabAuditController } from './api/lab-audit.controller';
import { LabBranchesController } from './api/lab-branches.controller';
import { LabStaffController } from './api/lab-staff.controller';
import { LaboratoriesController } from './api/laboratories.controller';
import { LabOrdersController } from './api/lab-orders.controller';
import { AddOperationalNoteUseCase } from './application/add-operational-note.use-case';
import { CollectSampleUseCase } from './application/collect-sample.use-case';
import { ConfirmLabBookingUseCase } from './application/confirm-lab-booking.use-case';
import { CreateLabBranchUseCase } from './application/create-lab-branch.use-case';
import { CreateLabOrderUseCase } from './application/create-lab-order.use-case';
import { CreateProviderLabOrderUseCase } from './application/create-provider-lab-order.use-case';
import { CreateLabStaffUseCase } from './application/create-lab-staff.use-case';
import { CreateLaboratoryUseCase } from './application/create-laboratory.use-case';
import { DeleteLabStaffUseCase } from './application/delete-lab-staff.use-case';
import { DispatchCourierUseCase } from './application/dispatch-courier.use-case';
import { GetCustodyEventsUseCase } from './application/get-custody-events.use-case';
import { GetLabBranchUseCase } from './application/get-lab-branch.use-case';
import { GetLabOrderUseCase } from './application/get-lab-order.use-case';
import { GetLabStaffUseCase } from './application/get-lab-staff.use-case';
import { GetLaboratoryUseCase } from './application/get-laboratory.use-case';
import { ListLabAuditUseCase } from './application/list-lab-audit.use-case';
import { ListLabOrdersUseCase } from './application/list-lab-orders.use-case';
import { ListLaboratoriesUseCase } from './application/list-laboratories.use-case';
import { RecordArrivalUseCase } from './application/record-arrival.use-case';
import { RecordResultDeliveryUseCase } from './application/record-result-delivery.use-case';
import { RecordResultUseCase } from './application/record-result.use-case';
import { RejectLabOrderUseCase } from './application/reject-lab-order.use-case';
import { RejectSampleUseCase } from './application/reject-sample.use-case';
import { RequestRecollectionUseCase } from './application/request-recollection.use-case';
import { RescheduleVisitUseCase } from './application/reschedule-visit.use-case';
import { ResolveLabStaffUseCase } from './application/resolve-lab-staff.use-case';
import { SearchLabBranchesUseCase } from './application/search-lab-branches.use-case';
import { SetCriticalFlagUseCase } from './application/set-critical-flag.use-case';
import { StartAnalysisUseCase } from './application/start-analysis.use-case';
import { SubmitLabQuoteUseCase } from './application/submit-lab-quote.use-case';
import { SuspendLaboratoryUseCase } from './application/suspend-laboratory.use-case';
import { UpdateLabBranchUseCase } from './application/update-lab-branch.use-case';
import { UpdateLabStaffUseCase } from './application/update-lab-staff.use-case';
import { UpdateLaboratoryUseCase } from './application/update-laboratory.use-case';
import { VerifyLaboratoryUseCase } from './application/verify-laboratory.use-case';
import { LabBranchRepository } from './infrastructure/lab-branch.repository';
import { LabStaffAssignmentRepository } from './infrastructure/lab-staff-assignment.repository';
import { LaboratoryRepository } from './infrastructure/laboratory.repository';
import { LabBranchSearchRepository } from './infrastructure/lab-branch-search.repository';
import { LabOrderItemRepository } from './infrastructure/lab-order-item.repository';
import { LabOrderNoteRepository } from './infrastructure/lab-order-note.repository';
import { LabOrderRepository } from './infrastructure/lab-order.repository';
import { LabResultRepository } from './infrastructure/lab-result.repository';
import { TestCatalogRepository } from './infrastructure/test-catalog.repository';
import { ListTestCatalogUseCase } from './application/list-test-catalog.use-case';
import { AuditModule } from '../audit/audit.module';
import { IdentityAuthModule } from '../identity-auth/identity-auth.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { ProviderDirectoryModule } from '../provider-directory/provider-directory.module';
import { SchedulingAppointmentsModule } from '../scheduling-appointments/scheduling-appointments.module';

/**
 * Laboratory module (File 12 Part 47, 2026-09-02) — un-postponed at the
 * user's explicit direction. Owns `laboratories`, `lab_branches`,
 * `test_catalog`, `lab_orders`, `lab_order_items`, `lab_result_documents`,
 * `lab_order_notes` (`prisma/schema/laboratory.prisma`) — no other module
 * reaches into these tables directly (File 12 Part 05).
 *
 * Built directly against `medsuper-laboratory-dashboard`'s own already-
 * complete, internally-consistent contract (`src/lib/api/types.ts`/
 * `service.ts`/`mock-service.ts`) — the only authoritative source here, no
 * File 10/11 spec exists for this domain (unlike pharmacy-fulfillment, which
 * reconciled two competing pre-existing contracts). Custody events reuse
 * the generic `audit_logs` store via `AuditModule`'s `AuditService`, the
 * same infrastructure the pharmacy audit endpoint (Part 43) already
 * extended — no dedicated custody-event table.
 *
 * `PrescriptionsModule` is imported only for `GetPrescriptionSummaryUseCase`
 * (optional prescription-linked orders' image projection) — never that
 * module's `infrastructure/`. `LabBranch` lookups are served by this
 * module's own `LabBranchRepository`. `LabBranchesController`/
 * `GetLabBranchUseCase` (Part 48) add one self-scoped
 * `GET /lab-branches/{id}` — not a public directory lookup — backing the
 * real-auth bridge's post-login branch display.
 *
 * The Admin laboratory directory (`LaboratoriesController` plus the
 * lab-branch mutations on `LabBranchesController`) lives here rather than in
 * `provider-directory`, even though verification is that module's concern:
 * `laboratories`/`lab_branches`/`lab_staff_assignments` are this module's
 * tables (File 12 Part 05), and `provider-directory` reading them would be
 * exactly the cross-module access that rule forbids. Labs are no longer
 * seed-only. `ProviderDirectoryModule` is imported for one thing only —
 * `ManageAddressUseCase`, the application-layer seam over `addresses`, which
 * that module does own.
 */
@Module({
  imports: [AuditModule, IdentityAuthModule, PrescriptionsModule, ProviderDirectoryModule, SchedulingAppointmentsModule],
  controllers: [LabOrdersController, LabAuditController, LabBranchesController, LaboratoriesController, LabStaffController],
  providers: [
    // infrastructure
    LabOrderRepository,
    LabOrderItemRepository,
    LabResultRepository,
    LabOrderNoteRepository,
    LabBranchRepository,
    LabBranchSearchRepository,
    LaboratoryRepository,
    LabStaffAssignmentRepository,
    TestCatalogRepository,
    ListTestCatalogUseCase,
    // application
    GetCustodyEventsUseCase,
    GetLabBranchUseCase,
    SearchLabBranchesUseCase,
    CreateLabOrderUseCase,
    CreateProviderLabOrderUseCase,
    ListLabOrdersUseCase,
    GetLabOrderUseCase,
    SubmitLabQuoteUseCase,
    ConfirmLabBookingUseCase,
    RecordArrivalUseCase,
    DispatchCourierUseCase,
    CollectSampleUseCase,
    RescheduleVisitUseCase,
    StartAnalysisUseCase,
    RecordResultUseCase,
    SetCriticalFlagUseCase,
    RejectSampleUseCase,
    RequestRecollectionUseCase,
    RejectLabOrderUseCase,
    AddOperationalNoteUseCase,
    RecordResultDeliveryUseCase,
    ListLabAuditUseCase,
    // Admin laboratory directory + the one-per-laboratory staff account.
    ListLaboratoriesUseCase,
    CreateLaboratoryUseCase,
    GetLaboratoryUseCase,
    UpdateLaboratoryUseCase,
    VerifyLaboratoryUseCase,
    SuspendLaboratoryUseCase,
    CreateLabBranchUseCase,
    UpdateLabBranchUseCase,
    ResolveLabStaffUseCase,
    GetLabStaffUseCase,
    CreateLabStaffUseCase,
    UpdateLabStaffUseCase,
    DeleteLabStaffUseCase,
  ],
})
export class LaboratoryModule {}
