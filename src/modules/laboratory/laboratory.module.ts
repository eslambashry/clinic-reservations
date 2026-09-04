import { Module } from '@nestjs/common';
import { LabAuditController } from './api/lab-audit.controller';
import { LabBranchesController } from './api/lab-branches.controller';
import { LabOrdersController } from './api/lab-orders.controller';
import { AddOperationalNoteUseCase } from './application/add-operational-note.use-case';
import { CollectSampleUseCase } from './application/collect-sample.use-case';
import { ConfirmLabBookingUseCase } from './application/confirm-lab-booking.use-case';
import { CreateLabOrderUseCase } from './application/create-lab-order.use-case';
import { DispatchCourierUseCase } from './application/dispatch-courier.use-case';
import { GetCustodyEventsUseCase } from './application/get-custody-events.use-case';
import { GetLabBranchUseCase } from './application/get-lab-branch.use-case';
import { GetLabOrderUseCase } from './application/get-lab-order.use-case';
import { ListLabAuditUseCase } from './application/list-lab-audit.use-case';
import { ListLabOrdersUseCase } from './application/list-lab-orders.use-case';
import { RecordArrivalUseCase } from './application/record-arrival.use-case';
import { RecordResultDeliveryUseCase } from './application/record-result-delivery.use-case';
import { RecordResultUseCase } from './application/record-result.use-case';
import { RejectLabOrderUseCase } from './application/reject-lab-order.use-case';
import { RejectSampleUseCase } from './application/reject-sample.use-case';
import { RequestRecollectionUseCase } from './application/request-recollection.use-case';
import { RescheduleVisitUseCase } from './application/reschedule-visit.use-case';
import { SearchLabBranchesUseCase } from './application/search-lab-branches.use-case';
import { SetCriticalFlagUseCase } from './application/set-critical-flag.use-case';
import { StartAnalysisUseCase } from './application/start-analysis.use-case';
import { SubmitLabQuoteUseCase } from './application/submit-lab-quote.use-case';
import { LabBranchRepository } from './infrastructure/lab-branch.repository';
import { LabBranchSearchRepository } from './infrastructure/lab-branch-search.repository';
import { LabOrderItemRepository } from './infrastructure/lab-order-item.repository';
import { LabOrderNoteRepository } from './infrastructure/lab-order-note.repository';
import { LabOrderRepository } from './infrastructure/lab-order.repository';
import { LabResultRepository } from './infrastructure/lab-result.repository';
import { TestCatalogRepository } from './infrastructure/test-catalog.repository';
import { AuditModule } from '../audit/audit.module';
import { IdentityAuthModule } from '../identity-auth/identity-auth.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';

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
 * module's own `LabBranchRepository` (read-only; branch directory
 * CRUD/verification, mirroring `provider-directory`'s pharmacy equivalent,
 * is out of scope — branches are seeded, not managed through an API yet).
 * `LabBranchesController`/`GetLabBranchUseCase` (Part 48) add exactly one
 * self-scoped `GET /lab-branches/{id}` — not a public directory lookup —
 * backing the real-auth bridge's post-login branch display.
 */
@Module({
  imports: [AuditModule, IdentityAuthModule, PrescriptionsModule],
  controllers: [LabOrdersController, LabAuditController, LabBranchesController],
  providers: [
    // infrastructure
    LabOrderRepository,
    LabOrderItemRepository,
    LabResultRepository,
    LabOrderNoteRepository,
    LabBranchRepository,
    LabBranchSearchRepository,
    TestCatalogRepository,
    // application
    GetCustodyEventsUseCase,
    GetLabBranchUseCase,
    SearchLabBranchesUseCase,
    CreateLabOrderUseCase,
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
  ],
})
export class LaboratoryModule {}
