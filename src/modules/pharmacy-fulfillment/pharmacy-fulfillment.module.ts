import { Module } from '@nestjs/common';

/**
 * File 11 Part 03/14: will own `pharmacy_orders`, `pharmacy_order_broadcasts`,
 * `pharmacy_order_items`, `substitutions` (`prisma/schema/pharmacy.prisma`) —
 * no other module reaches into these tables directly (File 12 Part 05).
 *
 * File 12 Part 39: this is a decisions-only scaffolding pass — the module is
 * intentionally empty and is not yet imported by `AppModule`. Order creation
 * + broadcast fan-out, broadcast accept/decline + its concurrency test,
 * substitution propose/approve/reject, payment-capture wiring (reusing
 * `payments`' `CapturePayAtClinicPaymentUseCase`, Part 39.7), the broadcast
 * timeout job, and branch-scoped pharmacy-staff RBAC (Part 39.5) are each a
 * separate follow-up pass, added to `providers`/`controllers` as they land.
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class PharmacyFulfillmentModule {}
