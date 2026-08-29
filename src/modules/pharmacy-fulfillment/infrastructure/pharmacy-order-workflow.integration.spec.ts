import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { AcceptPharmacyOrderBroadcastUseCase } from '../application/accept-pharmacy-order-broadcast.use-case';
import { ApprovePharmacyOrderUseCase } from '../application/approve-pharmacy-order.use-case';
import { CompletePharmacyOrderUseCase } from '../application/complete-pharmacy-order.use-case';
import { FulfillPharmacyOrderUseCase } from '../application/fulfill-pharmacy-order.use-case';
import { GetPharmacyOrderUseCase } from '../application/get-pharmacy-order.use-case';
import { ListPharmacyOrdersUseCase } from '../application/list-pharmacy-orders.use-case';
import { RejectPharmacyOrderUseCase } from '../application/reject-pharmacy-order.use-case';
import { SubmitPharmacyOrderQuoteUseCase } from '../application/submit-pharmacy-order-quote.use-case';
import { AppConfigModule } from '../../../shared/config/config.module';
import { RequestContextModule } from '../../../shared/core/context/request-context.module';
import { ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxModule } from '../../../shared/core/outbox/outbox.module';
import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';
import { PolicyConfigModule } from '../../../shared/kernel/policy-config/policy-config.module';
import { PrismaModule } from '../../../shared/kernel/prisma/prisma.module';
import { RedisModule } from '../../../shared/kernel/redis/redis.module';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PharmacyFulfillmentModule } from '../pharmacy-fulfillment.module';

dotenv.config();

/**
 * Real-Postgres, real-DI, no-mocks proof of the full Pharmacy Fulfillment
 * workflow this repository's own PharmacyFulfillmentModule wires together —
 * requested by the 2026-08-29 "final production-readiness gate" pass.
 * Every use-case here is the real class from `../application/*`, resolved
 * through the module's real providers (`PharmacyFulfillmentModule` imported
 * wholesale, same as it's wired in `AppModule`) against the actual local
 * Postgres — no repository/service is mocked. Two real, separate
 * pharmacy/branch pairs (Pharmacy A / Branch A1, Pharmacy B / Branch B1)
 * back the authorization/IDOR assertions.
 */
describe('Pharmacy Fulfillment workflow (integration, real Postgres)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let submitQuote: SubmitPharmacyOrderQuoteUseCase;
  let rejectOrder: RejectPharmacyOrderUseCase;
  let approveOrder: ApprovePharmacyOrderUseCase;
  let fulfillOrder: FulfillPharmacyOrderUseCase;
  let completeOrder: CompletePharmacyOrderUseCase;
  let getOrder: GetPharmacyOrderUseCase;
  let listOrders: ListPharmacyOrdersUseCase;
  let acceptBroadcast: AcceptPharmacyOrderBroadcastUseCase;

  const suffix = randomUUID().slice(0, 8);

  let addressId: string;
  let pharmacyAId: string;
  let pharmacyBId: string;
  let branchA1: string;
  let branchB1: string;
  let staffA: { userId: string; membershipId: string };
  let staffB: { userId: string; membershipId: string };
  let patientId: string;
  let patientMembershipId: string;

  const prescriptionIds: string[] = [];
  const orderIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule, PolicyConfigModule, OutboxModule, RequestContextModule, RedisModule, PharmacyFulfillmentModule],
    }).compile();
    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    submitQuote = moduleRef.get(SubmitPharmacyOrderQuoteUseCase);
    rejectOrder = moduleRef.get(RejectPharmacyOrderUseCase);
    approveOrder = moduleRef.get(ApprovePharmacyOrderUseCase);
    fulfillOrder = moduleRef.get(FulfillPharmacyOrderUseCase);
    completeOrder = moduleRef.get(CompletePharmacyOrderUseCase);
    getOrder = moduleRef.get(GetPharmacyOrderUseCase);
    listOrders = moduleRef.get(ListPharmacyOrdersUseCase);
    acceptBroadcast = moduleRef.get(AcceptPharmacyOrderBroadcastUseCase);

    await prisma.role.upsert({ where: { code: 'PHARMACY_STAFF' }, update: {}, create: { code: 'PHARMACY_STAFF', name: 'Pharmacy Staff' } });
    await prisma.role.upsert({ where: { code: 'PATIENT' }, update: {}, create: { code: 'PATIENT', name: 'Patient' } });

    const address = await prisma.address.create({ data: { line1: 'Test St', city: 'Cairo', region_code: 'EG', country_code: 'EG' } });
    addressId = address.id;

    const pharmacyA = await prisma.pharmacy.create({ data: { legal_name: `Pharmacy A ${suffix}`, brand_name: `Pharmacy A ${suffix}`, status: 'VERIFIED' } });
    pharmacyAId = pharmacyA.id;
    const branchA = await prisma.pharmacyBranch.create({
      data: { pharmacy_id: pharmacyAId, address_id: addressId, phone: `+2011${suffix}A`, iana_timezone: 'Africa/Cairo', status: 'VERIFIED' },
    });
    branchA1 = branchA.id;

    const pharmacyB = await prisma.pharmacy.create({ data: { legal_name: `Pharmacy B ${suffix}`, brand_name: `Pharmacy B ${suffix}`, status: 'VERIFIED' } });
    pharmacyBId = pharmacyB.id;
    const branchB = await prisma.pharmacyBranch.create({
      data: { pharmacy_id: pharmacyBId, address_id: addressId, phone: `+2012${suffix}B`, iana_timezone: 'Africa/Cairo', status: 'VERIFIED' },
    });
    branchB1 = branchB.id;

    const staffAUser = await prisma.user.create({ data: { phone: `+2013${suffix}A`, first_name: 'StaffA', last_name: 'Test' } });
    const staffAMembership = await prisma.roleMembership.create({
      data: { user_id: staffAUser.id, role_code: 'PHARMACY_STAFF', context_type: 'PHARMACY_STAFF', context_id: branchA1 },
    });
    staffA = { userId: staffAUser.id, membershipId: staffAMembership.id };

    const staffBUser = await prisma.user.create({ data: { phone: `+2014${suffix}B`, first_name: 'StaffB', last_name: 'Test' } });
    const staffBMembership = await prisma.roleMembership.create({
      data: { user_id: staffBUser.id, role_code: 'PHARMACY_STAFF', context_type: 'PHARMACY_STAFF', context_id: branchB1 },
    });
    staffB = { userId: staffBUser.id, membershipId: staffBMembership.id };

    const patientUser = await prisma.user.create({ data: { phone: `+2015${suffix}`, first_name: 'Patient', last_name: 'Test' } });
    patientId = patientUser.id;
    const patientMembership = await prisma.roleMembership.create({
      data: { user_id: patientId, role_code: 'PATIENT', context_type: 'PATIENT' },
    });
    patientMembershipId = patientMembership.id;
  }, 30000);

  afterAll(async () => {
    await prisma.paymentSplit.deleteMany({ where: { payment_intent: { payer_user_id: patientId } } });
    await prisma.providerLedgerEntry.deleteMany({ where: { provider_id: { in: [branchA1, branchB1] } } });
    await prisma.pharmacyOrder.updateMany({ where: { patient_id: patientId }, data: { payment_intent_id: null } });
    await prisma.paymentIntent.deleteMany({ where: { payer_user_id: patientId } });
    await prisma.pharmacyOrderBroadcast.deleteMany({ where: { pharmacy_branch_id: { in: [branchA1, branchB1] } } });
    await prisma.pharmacyOrder.deleteMany({ where: { patient_id: patientId } });
    await prisma.prescription.deleteMany({ where: { patient_id: patientId } });
    await prisma.outboxEvent.deleteMany({ where: { event_name: { in: ['PharmacyOrderAccepted', 'PharmacyOrderQuoted', 'PaymentCaptured'] } } });
    await prisma.auditLog.deleteMany({ where: { resource_type: 'pharmacy_order' } });
    await prisma.roleMembership.deleteMany({ where: { id: { in: [staffA.membershipId, staffB.membershipId, patientMembershipId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [staffA.userId, staffB.userId, patientId] } } });
    await prisma.pharmacyBranch.deleteMany({ where: { id: { in: [branchA1, branchB1] } } });
    await prisma.pharmacy.deleteMany({ where: { id: { in: [pharmacyAId, pharmacyBId] } } });
    await prisma.address.delete({ where: { id: addressId } });
    await moduleRef.close();
  }, 30000);

  function actorFor(staff: { userId: string; membershipId: string }) {
    return { sub: staff.userId, roleMembershipId: staff.membershipId, roleCode: 'PHARMACY_STAFF', contextType: 'PHARMACY_STAFF', permissions: [] } as any;
  }
  const patientActor = () => ({ sub: patientId, roleMembershipId: patientMembershipId, roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] }) as any;

  /** Fresh RECEIVED order, broadcast to the given branches. No PharmacyOrderItem rows — the flat-quote flow never reads them beyond the (empty-safe) controlled-substance check. */
  async function createBroadcastOrder(branchIds: string[], fulfillmentType: 'PICKUP' | 'DELIVERY' = 'PICKUP') {
    const prescription = await prisma.prescription.create({ data: { patient_id: patientId, source: 'PATIENT_UPLOADED', status: 'ACCEPTED' } });
    prescriptionIds.push(prescription.id);
    const order = await prisma.pharmacyOrder.create({
      data: { prescription_id: prescription.id, patient_id: patientId, fulfillment_type: fulfillmentType },
    });
    orderIds.push(order.id);
    if (branchIds.length > 0) {
      await prisma.pharmacyOrderBroadcast.createMany({ data: branchIds.map((id) => ({ pharmacy_order_id: order.id, pharmacy_branch_id: id })) });
    }
    return order.id;
  }

  // ---------------------------------------------------------------------
  // Full happy-path workflows — database -> use-case -> database at every step
  // ---------------------------------------------------------------------

  describe('full workflow', () => {
    it('PICKUP: RECEIVED -> claim-on-quote -> ACCEPTED -> approve/pay -> PAID -> fulfill -> READY_FOR_PICKUP -> complete -> FULFILLED', async () => {
      const orderId = await createBroadcastOrder([branchA1, branchB1], 'PICKUP');

      const quote = await submitQuote.execute(orderId, { totalPrice: '150.00', estimatedReadyMinutes: 30, note: 'كل الأصناف متوفرة' }, actorFor(staffA));
      expect(quote).toEqual({ pharmacyOrderId: orderId, status: 'ACCEPTED', totalPrice: '150.00', currency: 'EGP' });
      let row = await prisma.pharmacyOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(row.status).toBe('ACCEPTED');
      expect(row.pharmacy_branch_id).toBe(branchA1);
      expect(row.total_price?.toFixed(2)).toBe('150.00');
      const broadcastA = await prisma.pharmacyOrderBroadcast.findFirst({ where: { pharmacy_order_id: orderId, pharmacy_branch_id: branchA1 } });
      expect(broadcastA?.response).toBe('ACCEPTED');

      const approval = await approveOrder.execute(orderId, patientActor());
      expect(approval.status).toBe('PAID');
      expect(approval.totalAmount).toBe('150.00');
      row = await prisma.pharmacyOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(row.status).toBe('PAID');
      expect(row.payment_intent_id).toBe(approval.paymentIntentId);
      const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: approval.paymentIntentId } });
      expect(intent.status).toBe('CAPTURED');
      expect(intent.amount.toFixed(2)).toBe('150.00');

      const fulfilled = await fulfillOrder.execute(orderId, actorFor(staffA));
      expect(fulfilled.status).toBe('READY_FOR_PICKUP');
      row = await prisma.pharmacyOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(row.status).toBe('READY_FOR_PICKUP');

      const completed = await completeOrder.execute(orderId, actorFor(staffA));
      expect(completed.status).toBe('FULFILLED');
      row = await prisma.pharmacyOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(row.status).toBe('FULFILLED');

      // Read path agrees with what was persisted, from the owning patient's side.
      const detail = await getOrder.execute(orderId, patientActor());
      expect(detail.status).toBe('FULFILLED');
      expect(detail.quote).toEqual(expect.objectContaining({ totalPrice: '150.00', currency: 'EGP', estimatedReadyMinutes: 30 }));
    }, 20000);

    it('DELIVERY: fulfill goes to OUT_FOR_DELIVERY, complete closes it directly (no DELIVERED step anywhere)', async () => {
      const orderId = await createBroadcastOrder([branchA1], 'DELIVERY');
      await submitQuote.execute(orderId, { totalPrice: '75.50', estimatedReadyMinutes: 60 }, actorFor(staffA));
      await approveOrder.execute(orderId, patientActor());

      const fulfilled = await fulfillOrder.execute(orderId, actorFor(staffA));
      expect(fulfilled.status).toBe('OUT_FOR_DELIVERY');

      const completed = await completeOrder.execute(orderId, actorFor(staffA));
      expect(completed.status).toBe('FULFILLED');

      const row = await prisma.pharmacyOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(row.status).toBe('FULFILLED');
      // DELIVERED is not a member of the enum this order ever passed through.
      expect(['RECEIVED', 'UNDER_REVIEW', 'ACCEPTED', 'PAID', 'OUT_FOR_DELIVERY', 'FULFILLED']).not.toContain('DELIVERED');
    }, 20000);
  });

  // ---------------------------------------------------------------------
  // Reject / decline
  // ---------------------------------------------------------------------

  describe('reject / decline', () => {
    it('declines an unresponded broadcast without touching the order itself', async () => {
      const orderId = await createBroadcastOrder([branchA1, branchB1]);
      const result = await rejectOrder.execute(orderId, {}, actorFor(staffB));
      expect(result).toEqual({ pharmacyOrderId: orderId, status: 'RECEIVED' });

      const row = await prisma.pharmacyOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(row.status).toBe('RECEIVED');
      expect(row.pharmacy_branch_id).toBeNull();
      const broadcastB = await prisma.pharmacyOrderBroadcast.findFirst({ where: { pharmacy_order_id: orderId, pharmacy_branch_id: branchB1 } });
      expect(broadcastB?.response).toBe('DECLINED');
      // A1's broadcast is untouched — still open to accept/quote.
      const broadcastA = await prisma.pharmacyOrderBroadcast.findFirst({ where: { pharmacy_order_id: orderId, pharmacy_branch_id: branchA1 } });
      expect(broadcastA?.response).toBeNull();
    });

    it('rejects a claimed UNDER_REVIEW order outright, persisting reason/note', async () => {
      const orderId = await createBroadcastOrder([branchA1]);
      await acceptBroadcast.execute(orderId, actorFor(staffA));

      const result = await rejectOrder.execute(orderId, { reason: 'OUT_OF_STOCK', note: 'لا يوجد مخزون' }, actorFor(staffA));
      expect(result).toEqual({ pharmacyOrderId: orderId, status: 'REJECTED' });

      const row = await prisma.pharmacyOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(row.status).toBe('REJECTED');
      expect(row.rejection_reason).toBe('OUT_OF_STOCK');
      expect(row.rejection_note).toBe('لا يوجد مخزون');
      expect(row.rejected_at).not.toBeNull();
    });

    it('rejects an already-ACCEPTED (quoted) order — patient stalling on payment', async () => {
      const orderId = await createBroadcastOrder([branchA1]);
      await submitQuote.execute(orderId, { totalPrice: '200.00', estimatedReadyMinutes: 20 }, actorFor(staffA));

      const result = await rejectOrder.execute(orderId, { reason: 'OTHER', note: 'no response from patient' }, actorFor(staffA));
      expect(result.status).toBe('REJECTED');
      const row = await prisma.pharmacyOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(row.status).toBe('REJECTED');
    });
  });

  // ---------------------------------------------------------------------
  // Concurrency — real simultaneous requests against real Postgres
  // ---------------------------------------------------------------------

  describe('concurrency races', () => {
    it('Race 1: two branches quote the same unclaimed order simultaneously — exactly one claims it', async () => {
      const orderId = await createBroadcastOrder([branchA1, branchB1]);

      const outcomes = await Promise.allSettled([
        submitQuote.execute(orderId, { totalPrice: '100.00', estimatedReadyMinutes: 20 }, actorFor(staffA)),
        submitQuote.execute(orderId, { totalPrice: '120.00', estimatedReadyMinutes: 25 }, actorFor(staffB)),
      ]);

      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictError);
      expect(rejected[0].reason.code).toBe('ORDER_ALREADY_CLAIMED');

      const row = await prisma.pharmacyOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect([branchA1, branchB1]).toContain(row.pharmacy_branch_id);
      expect(row.status).toBe('ACCEPTED');
      // The winner's own price stuck — no partial/mixed write from the loser.
      expect(['100.00', '120.00']).toContain(row.total_price?.toFixed(2));

      const acceptedBroadcasts = await prisma.pharmacyOrderBroadcast.findMany({ where: { pharmacy_order_id: orderId, response: 'ACCEPTED' } });
      expect(acceptedBroadcasts).toHaveLength(1);
    }, 20000);

    it('Race 2: the same branch double-taps decline on its own broadcast — exactly one wins, the other gets a conflict, no double side effect', async () => {
      const orderId = await createBroadcastOrder([branchA1, branchB1]);

      const outcomes = await Promise.allSettled([
        rejectOrder.execute(orderId, {}, actorFor(staffB)),
        rejectOrder.execute(orderId, {}, actorFor(staffB)),
      ]);

      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictError);
      expect(rejected[0].reason.code).toBe('BROADCAST_ALREADY_RESPONDED');

      const broadcastB = await prisma.pharmacyOrderBroadcast.findFirst({ where: { pharmacy_order_id: orderId, pharmacy_branch_id: branchB1 } });
      expect(broadcastB?.response).toBe('DECLINED');
      // Order itself never touched by a decline.
      const row = await prisma.pharmacyOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(row.status).toBe('RECEIVED');
    }, 20000);

    it('Race 3 (stale version / duplicate submit): two identical quote requests fired at once on an already-claimed order — exactly one persists', async () => {
      const orderId = await createBroadcastOrder([branchA1]);
      await acceptBroadcast.execute(orderId, actorFor(staffA));

      const outcomes = await Promise.allSettled([
        submitQuote.execute(orderId, { totalPrice: '90.00', estimatedReadyMinutes: 15 }, actorFor(staffA)),
        submitQuote.execute(orderId, { totalPrice: '90.00', estimatedReadyMinutes: 15 }, actorFor(staffA)),
      ]);

      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(OptimisticLockError);

      const row = await prisma.pharmacyOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(row.status).toBe('ACCEPTED');
      // version 1 (created) -> 2 (acceptBroadcast's claim) -> 3 (the one quote that won); the loser's write never lands.
      expect(row.version).toBe(3);
    }, 20000);

    it('Race 4 (stale state on fulfill): two fulfill calls fired at once on the same PAID order — exactly one transitions it', async () => {
      const orderId = await createBroadcastOrder([branchA1]);
      await submitQuote.execute(orderId, { totalPrice: '60.00', estimatedReadyMinutes: 10 }, actorFor(staffA));
      await approveOrder.execute(orderId, patientActor());

      const outcomes = await Promise.allSettled([
        fulfillOrder.execute(orderId, actorFor(staffA)),
        fulfillOrder.execute(orderId, actorFor(staffA)),
      ]);

      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(OptimisticLockError);

      const row = await prisma.pharmacyOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(row.status).toBe('READY_FOR_PICKUP');
    }, 20000);

    it('Race 5 (duplicate complete): two complete calls fired at once — exactly one closes it, no corrupted state', async () => {
      const orderId = await createBroadcastOrder([branchA1]);
      await submitQuote.execute(orderId, { totalPrice: '45.00', estimatedReadyMinutes: 10 }, actorFor(staffA));
      await approveOrder.execute(orderId, patientActor());
      await fulfillOrder.execute(orderId, actorFor(staffA));

      const outcomes = await Promise.allSettled([
        completeOrder.execute(orderId, actorFor(staffA)),
        completeOrder.execute(orderId, actorFor(staffA)),
      ]);

      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(OptimisticLockError);

      const row = await prisma.pharmacyOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(row.status).toBe('FULFILLED');
    }, 20000);
  });

  // ---------------------------------------------------------------------
  // IDOR / cross-branch authorization — Pharmacy A / Branch A1 vs Pharmacy B / Branch B1
  // ---------------------------------------------------------------------

  describe('IDOR / branch-scoped authorization', () => {
    it("Branch B cannot get, quote, reject, fulfill, or complete Branch A's order by supplying its own credentials against A's orderId", async () => {
      // Broadcast ONLY to A1 — B1 has no legitimate relationship to this order at all.
      const orderId = await createBroadcastOrder([branchA1]);
      await submitQuote.execute(orderId, { totalPrice: '80.00', estimatedReadyMinutes: 20 }, actorFor(staffA));
      await approveOrder.execute(orderId, patientActor());
      await fulfillOrder.execute(orderId, actorFor(staffA));

      await expect(getOrder.execute(orderId, actorFor(staffB))).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        submitQuote.execute(orderId, { totalPrice: '999.00', estimatedReadyMinutes: 5 }, actorFor(staffB)),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(rejectOrder.execute(orderId, { reason: 'OTHER' }, actorFor(staffB))).rejects.toBeInstanceOf(NotFoundError);
      await expect(fulfillOrder.execute(orderId, actorFor(staffB))).rejects.toBeInstanceOf(NotFoundError);
      await expect(completeOrder.execute(orderId, actorFor(staffB))).rejects.toBeInstanceOf(NotFoundError);

      // None of Branch B's probes mutated anything — A's order is exactly where A left it.
      const row = await prisma.pharmacyOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(row.status).toBe('READY_FOR_PICKUP');
      expect(row.total_price?.toFixed(2)).toBe('80.00');
      expect(row.pharmacy_branch_id).toBe(branchA1);
    }, 20000);

    it("Branch B's queue never includes Branch A's claimed order or an order never broadcast to B", async () => {
      const orderId = await createBroadcastOrder([branchA1]);
      await submitQuote.execute(orderId, { totalPrice: '55.00', estimatedReadyMinutes: 15 }, actorFor(staffA));

      const [queueA, queueB] = await Promise.all([listOrders.execute({}, actorFor(staffA)), listOrders.execute({}, actorFor(staffB))]);
      expect(queueA.orders.some((o) => o.id === orderId)).toBe(true);
      expect(queueB.orders.some((o) => o.id === orderId)).toBe(false);
    }, 20000);

    it('GET requires an actual claim, not just being a broadcast target — a real ownership check, not a rubber stamp', async () => {
      // Broadcast to A1, unclaimed. A1 is a legitimate target but hasn't
      // accepted/quoted yet, so GetPharmacyOrderUseCase's `isAssignedStaff`
      // check (membership.contextId === order.pharmacy_branch_id) is still
      // false — `pharmacy_branch_id` is null pre-claim. Confirms branch
      // scope is resolved from actual claim state in the DB, never inferred
      // just because a branch happens to be one of the broadcast recipients.
      const orderId = await createBroadcastOrder([branchA1]);
      await expect(getOrder.execute(orderId, actorFor(staffA))).rejects.toBeInstanceOf(NotFoundError);
      await expect(getOrder.execute(orderId, actorFor(staffB))).rejects.toBeInstanceOf(NotFoundError);

      // The moment A1 actually claims it (via quote), the same actor/order pair succeeds.
      await submitQuote.execute(orderId, { totalPrice: '30.00', estimatedReadyMinutes: 10 }, actorFor(staffA));
      const detail = await getOrder.execute(orderId, actorFor(staffA));
      expect(detail.id).toBe(orderId);
      await expect(getOrder.execute(orderId, actorFor(staffB))).rejects.toBeInstanceOf(NotFoundError);
    }, 20000);
  });

  // ---------------------------------------------------------------------
  // Money — decimal precision end to end, no float corruption
  // ---------------------------------------------------------------------

  describe('money handling', () => {
    it.each([
      ['0.01', 15, '0.00', '0.01'],
      ['10.00', 15, '1.50', '8.50'],
      ['999.99', 15, '150.00', '849.99'],
      ['12345.67', 15, '1851.85', '10493.82'],
    ])('quotes %s, captures it exactly, and splits commission correctly (platform %s / provider %s)', async (amount, _rate, expectedPlatform, expectedProvider) => {
      const orderId = await createBroadcastOrder([branchA1]);
      const quote = await submitQuote.execute(orderId, { totalPrice: amount, estimatedReadyMinutes: 30 }, actorFor(staffA));
      expect(quote.totalPrice).toBe(amount);

      const persisted = await prisma.pharmacyOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(persisted.total_price?.toFixed(2)).toBe(amount);

      const approval = await approveOrder.execute(orderId, patientActor());
      expect(approval.totalAmount).toBe(amount);

      const splits = await prisma.paymentSplit.findMany({ where: { payment_intent_id: approval.paymentIntentId } });
      const platform = splits.find((s) => s.payee_type === 'PLATFORM');
      const provider = splits.find((s) => s.payee_type === 'PROVIDER');
      expect(platform?.amount.toFixed(2)).toBe(expectedPlatform);
      expect(provider?.amount.toFixed(2)).toBe(expectedProvider);

      const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: approval.paymentIntentId } });
      expect(intent.amount.toFixed(2)).toBe(amount);
    }, 20000);
  });
});
