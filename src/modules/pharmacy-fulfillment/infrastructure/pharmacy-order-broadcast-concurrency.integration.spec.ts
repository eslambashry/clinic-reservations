import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { PharmacyOrderBroadcastRepository } from './pharmacy-order-broadcast.repository';
import { PharmacyOrderRepository } from './pharmacy-order.repository';
import { AcceptPharmacyOrderBroadcastUseCase } from '../application/accept-pharmacy-order-broadcast.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AuditLogRepository } from '../../audit/infrastructure/audit-log.repository';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { RoleMembershipRepository } from '../../identity-auth/infrastructure/role-membership.repository';
import { AppConfigModule } from '../../../shared/config/config.module';
import { RequestContextService } from '../../../shared/core/context/request-context.service';
import { ConflictError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaModule } from '../../../shared/kernel/prisma/prisma.module';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';

dotenv.config();

/**
 * File 11 Part 26 "N simultaneous pharmacy-broadcast accepts, one wins" /
 * File 11 line 456 — runs `AcceptPharmacyOrderBroadcastUseCase` against a
 * real Postgres with N pharmacy branches racing to accept the same order.
 * Scoped to exactly the providers that use-case needs, same rationale as
 * `appointment-hold-concurrency.integration.spec.ts`.
 */
describe('Pharmacy order broadcast accept (integration)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let acceptBroadcast: AcceptPharmacyOrderBroadcastUseCase;

  const suffix = randomUUID().slice(0, 8);
  const CONCURRENT_BRANCHES = 5;

  let addressId: string;
  let pharmacyId: string;
  let patientUserId: string;
  const branchIds: string[] = [];
  const staffUserIds: string[] = [];
  const roleMembershipIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule],
      providers: [
        PharmacyOrderRepository,
        PharmacyOrderBroadcastRepository,
        RoleMembershipRepository,
        GetActiveRoleMembershipUseCase,
        AuditLogRepository,
        AuditService,
        RequestContextService,
        OutboxService,
        AcceptPharmacyOrderBroadcastUseCase,
      ],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    acceptBroadcast = moduleRef.get(AcceptPharmacyOrderBroadcastUseCase);

    await prisma.role.upsert({
      where: { code: 'PHARMACY_STAFF' },
      update: {},
      create: { code: 'PHARMACY_STAFF', name: 'Pharmacy Staff' },
    });

    const address = await prisma.address.create({ data: { line1: 'Test St', city: 'Cairo', region_code: 'CAI', country_code: 'EG' } });
    addressId = address.id;

    const pharmacy = await prisma.pharmacy.create({
      data: { legal_name: `Test Pharmacy ${suffix}`, brand_name: `Test Pharmacy ${suffix}`, status: 'VERIFIED' },
    });
    pharmacyId = pharmacy.id;

    for (let i = 0; i < CONCURRENT_BRANCHES; i++) {
      const branch = await prisma.pharmacyBranch.create({
        data: { pharmacy_id: pharmacyId, address_id: addressId, phone: `+201${suffix}${i}`, iana_timezone: 'Africa/Cairo', status: 'VERIFIED' },
      });
      branchIds.push(branch.id);

      const staffUser = await prisma.user.create({ data: { phone: `+2012${suffix}${i}`, first_name: `Staff${i}`, last_name: 'Test' } });
      staffUserIds.push(staffUser.id);

      const membership = await prisma.roleMembership.create({
        data: { user_id: staffUser.id, role_code: 'PHARMACY_STAFF', context_type: 'PHARMACY_STAFF', context_id: branch.id },
      });
      roleMembershipIds.push(membership.id);
    }

    const patientUser = await prisma.user.create({ data: { phone: `+2013${suffix}`, first_name: 'Patient', last_name: 'Test' } });
    patientUserId = patientUser.id;
  }, 30000);

  afterAll(async () => {
    await prisma.pharmacyOrderBroadcast.deleteMany({ where: { pharmacy_branch_id: { in: branchIds } } });
    await prisma.pharmacyOrder.deleteMany({ where: { patient_id: patientUserId } });
    await prisma.prescription.deleteMany({ where: { patient_id: patientUserId } });
    await prisma.outboxEvent.deleteMany({ where: { event_name: 'PharmacyOrderAccepted' } });
    await prisma.auditLog.deleteMany({ where: { resource_type: 'pharmacy_order' } });
    await prisma.roleMembership.deleteMany({ where: { id: { in: roleMembershipIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [...staffUserIds, patientUserId] } } });
    await prisma.pharmacyBranch.deleteMany({ where: { id: { in: branchIds } } });
    await prisma.pharmacy.delete({ where: { id: pharmacyId } });
    await prisma.address.delete({ where: { id: addressId } });
    await moduleRef.close();
  }, 20000);

  function actorForStaff(index: number) {
    return { sub: staffUserIds[index], roleMembershipId: roleMembershipIds[index], roleCode: 'PHARMACY_STAFF', contextType: 'PHARMACY_STAFF', permissions: [] } as any;
  }

  it('lets exactly one of N simultaneous branches accept the same broadcast order', async () => {
    const prescription = await prisma.prescription.create({
      data: { patient_id: patientUserId, source: 'PATIENT_UPLOADED', status: 'ACCEPTED' },
    });
    const order = await prisma.pharmacyOrder.create({
      data: { prescription_id: prescription.id, patient_id: patientUserId, fulfillment_type: 'PICKUP' },
    });
    await prisma.pharmacyOrderBroadcast.createMany({
      data: branchIds.map((branchId) => ({ pharmacy_order_id: order.id, pharmacy_branch_id: branchId })),
    });

    const outcomes = await Promise.allSettled(
      branchIds.map((_, index) => acceptBroadcast.execute(order.id, actorForStaff(index))),
    );

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(branchIds.length - 1);
    for (const outcome of rejected) {
      expect((outcome as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    }

    const refreshedOrder = await prisma.pharmacyOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(refreshedOrder.status).toBe('UNDER_REVIEW');
    expect(branchIds).toContain(refreshedOrder.pharmacy_branch_id);

    const broadcasts = await prisma.pharmacyOrderBroadcast.findMany({ where: { pharmacy_order_id: order.id } });
    const accepted = broadcasts.filter((b) => b.response === 'ACCEPTED');
    expect(accepted).toHaveLength(1);
    expect(accepted[0].pharmacy_branch_id).toBe(refreshedOrder.pharmacy_branch_id);
  }, 20000);
});
