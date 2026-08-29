import { Module } from '@nestjs/common';
import { PharmacyOrdersController } from './api/pharmacy-orders.controller';
import { AcceptPharmacyOrderBroadcastUseCase } from './application/accept-pharmacy-order-broadcast.use-case';
import { ApprovePharmacyOrderUseCase } from './application/approve-pharmacy-order.use-case';
import { CompletePharmacyOrderUseCase } from './application/complete-pharmacy-order.use-case';
import { CreatePharmacyOrderUseCase } from './application/create-pharmacy-order.use-case';
import { DeclinePharmacyOrderBroadcastUseCase } from './application/decline-pharmacy-order-broadcast.use-case';
import { FulfillPharmacyOrderUseCase } from './application/fulfill-pharmacy-order.use-case';
import { GetPharmacyOrderUseCase } from './application/get-pharmacy-order.use-case';
import { ListPharmacyOrdersUseCase } from './application/list-pharmacy-orders.use-case';
import { RejectPharmacyOrderUseCase } from './application/reject-pharmacy-order.use-case';
import { RejectPharmacyOrderSubstitutionUseCase } from './application/reject-pharmacy-order-substitution.use-case';
import { SubmitPharmacyOrderQuoteUseCase } from './application/submit-pharmacy-order-quote.use-case';
import { PharmacyOrderBroadcastRepository } from './infrastructure/pharmacy-order-broadcast.repository';
import { PharmacyOrderItemRepository } from './infrastructure/pharmacy-order-item.repository';
import { PharmacyOrderRepository } from './infrastructure/pharmacy-order.repository';
import { SubstitutionRepository } from './infrastructure/substitution.repository';
import { AuditModule } from '../audit/audit.module';
import { IdentityAuthModule } from '../identity-auth/identity-auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { ProviderDirectoryModule } from '../provider-directory/provider-directory.module';

/**
 * File 11 Part 03/14: owns `pharmacy_orders`, `pharmacy_order_broadcasts`,
 * `pharmacy_order_items`, `substitutions` (`prisma/schema/pharmacy.prisma`) —
 * no other module reaches into these tables directly (File 12 Part 05).
 *
 * File 12 Part 39: order creation + broadcast fan-out calls
 * `PrescriptionsModule`'s `GetAcceptedPrescriptionForOrderUseCase` (Part
 * 39.3) and `ProviderDirectoryModule`'s `SearchPharmacyBranchesUseCase`
 * (Part 39.2) — never those modules' `infrastructure/`. Broadcast
 * accept/decline calls `IdentityAuthModule`'s `GetActiveRoleMembershipUseCase`
 * to resolve which branch the caller belongs to (Part 39.5/39.12). The
 * quote additionally calls `PrescriptionsModule`'s
 * `GetPrescriptionItemDrugCodesUseCase`/`GetDrugCatalogControlledStatusUseCase`.
 * Patient `approve` (this pass) reuses `PaymentsModule`'s
 * `CapturePayAtClinicPaymentUseCase` as-is (Part 39.7) — fused with
 * payment-intent creation per File 10 Part 8.1. The broadcast timeout job
 * remains a separate follow-up pass.
 *
 * 2026-08-29 (`medsuper-pharmacy-dashboard` integration pass): quoting moved
 * to a flat total (`SubstitutionRepository`/item pricing are now only used
 * by order creation and the still-registered-but-practically-unreachable
 * `RejectPharmacyOrderSubstitutionUseCase`, kept for forward-compat).
 * `GetPharmacyOrderUseCase`'s reshaped response additionally calls
 * `IdentityAuthModule`'s `GetUserSummaryUseCase` and `PrescriptionsModule`'s
 * `GetPrescriptionSummaryUseCase`. New: `RejectPharmacyOrderUseCase`
 * (staff-initiated whole-order reject), `FulfillPharmacyOrderUseCase`/
 * `CompletePharmacyOrderUseCase` (post-payment progression, previously
 * entirely missing), `ListPharmacyOrdersUseCase` (the queue listing File 12
 * Part 39 item 11 named but never built).
 */
@Module({
  imports: [AuditModule, PrescriptionsModule, ProviderDirectoryModule, IdentityAuthModule, PaymentsModule],
  controllers: [PharmacyOrdersController],
  providers: [
    // infrastructure
    PharmacyOrderRepository,
    PharmacyOrderItemRepository,
    PharmacyOrderBroadcastRepository,
    SubstitutionRepository,
    // application
    CreatePharmacyOrderUseCase,
    AcceptPharmacyOrderBroadcastUseCase,
    DeclinePharmacyOrderBroadcastUseCase,
    SubmitPharmacyOrderQuoteUseCase,
    RejectPharmacyOrderUseCase,
    RejectPharmacyOrderSubstitutionUseCase,
    ApprovePharmacyOrderUseCase,
    FulfillPharmacyOrderUseCase,
    CompletePharmacyOrderUseCase,
    ListPharmacyOrdersUseCase,
    GetPharmacyOrderUseCase,
  ],
})
export class PharmacyFulfillmentModule {}
