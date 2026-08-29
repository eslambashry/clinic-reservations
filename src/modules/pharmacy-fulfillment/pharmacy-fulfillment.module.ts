import { Module } from '@nestjs/common';
import { PharmacyOrdersController } from './api/pharmacy-orders.controller';
import { AcceptPharmacyOrderBroadcastUseCase } from './application/accept-pharmacy-order-broadcast.use-case';
import { CreatePharmacyOrderUseCase } from './application/create-pharmacy-order.use-case';
import { DeclinePharmacyOrderBroadcastUseCase } from './application/decline-pharmacy-order-broadcast.use-case';
import { PharmacyOrderBroadcastRepository } from './infrastructure/pharmacy-order-broadcast.repository';
import { PharmacyOrderItemRepository } from './infrastructure/pharmacy-order-item.repository';
import { PharmacyOrderRepository } from './infrastructure/pharmacy-order.repository';
import { AuditModule } from '../audit/audit.module';
import { IdentityAuthModule } from '../identity-auth/identity-auth.module';
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
 * accept/decline (this pass) calls `IdentityAuthModule`'s
 * `GetActiveRoleMembershipUseCase` to resolve which branch the caller
 * belongs to (Part 39.5's decided branch-scoped-RBAC shape). Substitution
 * propose/approve/reject, payment-capture wiring (reusing `payments`'
 * `CapturePayAtClinicPaymentUseCase`, Part 39.7), and the broadcast timeout
 * job are each a separate follow-up pass.
 */
@Module({
  imports: [AuditModule, PrescriptionsModule, ProviderDirectoryModule, IdentityAuthModule],
  controllers: [PharmacyOrdersController],
  providers: [
    // infrastructure
    PharmacyOrderRepository,
    PharmacyOrderItemRepository,
    PharmacyOrderBroadcastRepository,
    // application
    CreatePharmacyOrderUseCase,
    AcceptPharmacyOrderBroadcastUseCase,
    DeclinePharmacyOrderBroadcastUseCase,
  ],
})
export class PharmacyFulfillmentModule {}
