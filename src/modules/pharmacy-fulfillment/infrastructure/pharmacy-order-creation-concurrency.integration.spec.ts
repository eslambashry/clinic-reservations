import { Prisma, PrismaClient, PharmacyOrderStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CreatePharmacyOrderUseCase } from '../application/create-pharmacy-order.use-case';
import { PharmacyOrderRepository } from './pharmacy-order.repository';
import { PharmacyOrderItemRepository } from './pharmacy-order-item.repository';
import { PharmacyOrderBroadcastRepository } from './pharmacy-order-broadcast.repository';
import { GetAcceptedPrescriptionForOrderUseCase } from '../../prescriptions/application/get-accepted-prescription-for-order.use-case';
import { PrescriptionRepository } from '../../prescriptions/infrastructure/prescription.repository';
import { PrescriptionItemRepository } from '../../prescriptions/infrastructure/prescription-item.repository';
import { PrescriptionImageRepository } from '../../prescriptions/infrastructure/prescription-image.repository';
import { AuditService } from '../../audit/application/audit.service';
import { AuditLogRepository } from '../../audit/infrastructure/audit-log.repository';
import { RequestContextService } from '../../../shared/core/context/request-context.service';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Requires the explicitly disposable TEST_DATABASE_URL enforced by jest.integration.config.js. */
describe('one active pharmacy order per prescription (real PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  const suffix = randomUUID();
  const prescriptionIds: string[] = [];
  const userIds: string[] = [];
  let patient: AccessTokenPayload;
  let doctor: AccessTokenPayload;
  let assistant: AccessTokenPayload;
  let branchId: string;
  let pharmacyId: string;
  let addressId: string;

  beforeAll(async () => {
    for (const role of ['PATIENT', 'DOCTOR', 'CLINIC_STAFF']) {
      await prisma.role.upsert({ where: { code: role }, update: {}, create: { code: role, name: role } });
    }
    const actors: AccessTokenPayload[] = [];
    for (const contextType of ['PATIENT', 'DOCTOR', 'CLINIC_STAFF'] as const) {
      const user = await prisma.user.create({ data: { phone: `fixture-${suffix}-${contextType}` } });
      userIds.push(user.id);
      const membership = await prisma.roleMembership.create({ data: { user_id: user.id, role_code: contextType, context_type: contextType } });
      actors.push({ sub: user.id, roleMembershipId: membership.id, roleCode: contextType, contextType, permissions: ['pharmacy-orders:create:assistant'] });
    }
    [patient, doctor, assistant] = actors;
    const address = await prisma.address.create({ data: { line1: 'Order race fixture', city: 'Cairo', region_code: 'CAI', country_code: 'EG' } });
    addressId = address.id;
    const pharmacy = await prisma.pharmacy.create({ data: { legal_name: `Race ${suffix}`, brand_name: 'Race fixture', status: 'VERIFIED' } });
    pharmacyId = pharmacy.id;
    const branch = await prisma.pharmacyBranch.create({ data: { pharmacy_id: pharmacyId, address_id: addressId, phone: '+201000000000', iana_timezone: 'Africa/Cairo', status: 'VERIFIED' } });
    branchId = branch.id;
  });

  afterAll(async () => {
    const orders = await prisma.pharmacyOrder.findMany({ where: { prescription_id: { in: prescriptionIds } }, select: { id: true } });
    const orderIds = orders.map((order) => order.id);
    await prisma.auditLog.deleteMany({ where: { resource_id: { in: orderIds } } });
    await prisma.outboxEvent.deleteMany({ where: { OR: prescriptionIds.map((id) => ({ payload: { path: ['prescriptionId'], equals: id } })).concat(orderIds.map((id) => ({ payload: { path: ['pharmacyOrderId'], equals: id } }))) } });
    await prisma.pharmacyOrderBroadcast.deleteMany({ where: { pharmacy_order_id: { in: orderIds } } });
    await prisma.pharmacyOrderItem.deleteMany({ where: { pharmacy_order_id: { in: orderIds } } });
    await prisma.pharmacyOrder.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.prescriptionItem.deleteMany({ where: { prescription_id: { in: prescriptionIds } } });
    await prisma.prescription.deleteMany({ where: { id: { in: prescriptionIds } } });
    await prisma.roleMembership.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (branchId) await prisma.pharmacyBranch.delete({ where: { id: branchId } });
    if (pharmacyId) await prisma.pharmacy.delete({ where: { id: pharmacyId } });
    if (addressId) await prisma.address.delete({ where: { id: addressId } });
    await prisma.$disconnect();
  });

  async function prescription() {
    const row = await prisma.prescription.create({ data: { patient_id: patient.sub, doctor_id: doctor.sub, source: 'DOCTOR_ISSUED', document_type: 'PRESCRIPTION', status: 'ACCEPTED' } });
    prescriptionIds.push(row.id);
    await prisma.prescriptionItem.create({ data: { prescription_id: row.id, drug_name_free_text: 'Fixture medication', quantity: 1 } });
    return row.id;
  }

  function useCase(db: unknown = prisma) {
    return new CreatePharmacyOrderUseCase(
      db as any, new PharmacyOrderRepository(), new PharmacyOrderItemRepository(), new PharmacyOrderBroadcastRepository(),
      new GetAcceptedPrescriptionForOrderUseCase(new PrescriptionRepository(), new PrescriptionItemRepository(), new PrescriptionImageRepository()),
      {} as any, { execute: async () => ({ id: branchId, delivery_capable: false }) } as any,
      new AuditService(new AuditLogRepository(), new RequestContextService()), new OutboxService(),
      { execute: async () => [] } as any,
      { execute: async () => ({ doctorUserId: doctor.sub, affiliationIds: ['fixture-affiliation'] }) } as any,
      { execute: async () => undefined } as any, {} as any,
    );
  }

  async function verifySideEffects(id: string, expectedOrders: number) {
    const orders = await prisma.pharmacyOrder.findMany({ where: { prescription_id: id } });
    expect(orders.filter((order) => !['REJECTED', 'FULFILLED'].includes(order.status))).toHaveLength(expectedOrders);
    const ids = orders.map((order) => order.id);
    expect(await prisma.pharmacyOrderItem.count({ where: { pharmacy_order_id: { in: ids } } })).toBe(expectedOrders);
    expect(await prisma.pharmacyOrderBroadcast.count({ where: { pharmacy_order_id: { in: ids } } })).toBe(expectedOrders);
    expect(await prisma.auditLog.count({ where: { resource_id: { in: ids }, action: 'pharmacy-fulfillment.pharmacy-order.create' } })).toBe(expectedOrders);
    expect(await prisma.outboxEvent.count({ where: { event_name: 'PharmacyOrderCreated', payload: { path: ['prescriptionId'], equals: id } } })).toBe(expectedOrders);
  }

  it.each(['patient', 'doctor', 'assistant', 'mixed'])('serializes forced concurrent %s requests independently of HTTP idempotency keys', async (mode) => {
    const id = await prescription();
    const entered = signal();
    const release = signal();
    const starts = signal();
    const run = signal();
    const count = 6;
    let started = 0;
    const db = { $transaction: (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => prisma.$transaction(async (tx) => {
      if (++started === count) starts.resolve();
      await run.promise;
      return fn(tx);
    }, { timeout: 15000, maxWait: 15000 }) };
    // FOR NO KEY UPDATE permits ordinary FK inserts (KEY SHARE), but blocks the proposed Rx write lock.
    // Thus this schedule exposes the original check-then-insert race instead of accidentally fixing it in the test.
    const blocker = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM prescriptions WHERE id = ${id}::uuid FOR NO KEY UPDATE`;
      entered.resolve();
      await release.promise;
    }, { timeout: 15000 });
    await entered.promise;
    const creator = useCase(db);
    const input = { prescriptionId: id, fulfillmentType: 'PICKUP' as const, pharmacyBranchId: branchId };
    const calls = Array.from({ length: count }, (_, index) => {
      const actor = mode === 'patient' ? patient : mode === 'assistant' ? assistant : mode === 'doctor' ? doctor : [patient, doctor, assistant][index % 3];
      return actor === patient ? creator.execute(input, actor) : creator.executeForProvider({ ...input, patientId: patient.sub }, actor);
    });
    const outcomes = Promise.allSettled(calls);
    let monitoring = true;
    try {
      await starts.promise;
      run.resolve();
      // Observe actual database blocking, or the vulnerable requests finishing without a lock.
      const locked = (async () => {
        for (let attempt = 0; attempt < 100 && monitoring; attempt++) {
          const waiting = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND query LIKE '%FROM prescriptions WHERE id =%' AND cardinality(pg_blocking_pids(pid)) > 0`;
          if (Number(waiting[0].count) === count) return;
          await new Promise((done) => setTimeout(done, 20));
        }
        if (monitoring) throw new Error('All create transactions did not reach the prescription row lock');
      })();
      await Promise.race([locked, outcomes]);
    } finally {
      monitoring = false;
      release.resolve();
      run.resolve();
      await blocker;
    }
    const results = await outcomes;
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    for (const result of results.filter((result) => result.status === 'rejected')) {
      expect((result as PromiseRejectedResult).reason).toMatchObject({ code: 'PHARMACY_ORDER_ALREADY_EXISTS', httpStatus: 409 });
    }
    await verifySideEffects(id, 1);
  }, 20000);

  it.each(Object.values(PharmacyOrderStatus).filter((status) => !['REJECTED', 'FULFILLED'].includes(status)))('rejects older active %s even when the newest order is terminal', async (status) => {
    const id = await prescription();
    await prisma.pharmacyOrder.createMany({ data: [
      { prescription_id: id, patient_id: patient.sub, fulfillment_type: 'PICKUP', status, created_at: new Date('2026-01-01T00:00:00Z') },
      { prescription_id: id, patient_id: patient.sub, fulfillment_type: 'PICKUP', status: 'FULFILLED', created_at: new Date('2026-02-01T00:00:00Z') },
    ] });
    await expect(useCase().execute({ prescriptionId: id, fulfillmentType: 'PICKUP', pharmacyBranchId: branchId }, patient))
      .rejects.toMatchObject({ code: 'PHARMACY_ORDER_ALREADY_EXISTS', httpStatus: 409 });
    expect(await prisma.pharmacyOrder.count({ where: { prescription_id: id } })).toBe(2);
  });

  it.each(['REJECTED', 'FULFILLED'] as PharmacyOrderStatus[])('allows reordering after the previous order is %s', async (status) => {
    const id = await prescription();
    await prisma.pharmacyOrder.create({ data: { prescription_id: id, patient_id: patient.sub, fulfillment_type: 'PICKUP', status } });
    await expect(useCase().execute({ prescriptionId: id, fulfillmentType: 'PICKUP', pharmacyBranchId: branchId }, patient)).resolves.toMatchObject({ status: 'RECEIVED' });
    await verifySideEffects(id, 1);
  });
});
