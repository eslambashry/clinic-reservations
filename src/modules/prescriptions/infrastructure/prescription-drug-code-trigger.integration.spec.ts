import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigModule } from '../../../shared/config/config.module';
import { PrismaModule } from '../../../shared/kernel/prisma/prisma.module';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';

dotenv.config();

/**
 * File 11 line 864 / File 12 Part 37.8: "an integration test proves OCR
 * output alone can never reach ACCEPTED without a prescription_reviews row."
 * This deliberately bypasses every use-case and talks to the database
 * directly — the whole point of a DB-level trigger (rather than
 * application-layer discipline) is that it holds even if a future code path
 * forgets the rule, so the proof has to be at that same level, not just
 * "the use-case's own code happens to check this."
 */
describe('prescription_items drug_code review trigger (integration)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  const suffix = randomUUID().slice(0, 8);
  const drugCode = `TEST_DRUG_${suffix}`;
  let patientId: string;
  let pharmacistId: string;
  let prescriptionId: string;
  let itemId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppConfigModule, PrismaModule] }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);

    await prisma.drugCatalog.create({ data: { code: drugCode, generic_name: 'Test Drug' } });

    const patient = await prisma.user.create({ data: { phone: `+2012${suffix}0` } });
    const pharmacist = await prisma.user.create({ data: { phone: `+2012${suffix}1` } });
    patientId = patient.id;
    pharmacistId = pharmacist.id;

    const prescription = await prisma.prescription.create({ data: { patient_id: patientId, source: 'PATIENT_UPLOADED' } });
    prescriptionId = prescription.id;

    const item = await prisma.prescriptionItem.create({ data: { prescription_id: prescriptionId, drug_name_free_text: 'Test Drug' } });
    itemId = item.id;
  }, 30000);

  afterAll(async () => {
    await prisma.prescriptionItem.deleteMany({ where: { prescription_id: prescriptionId } });
    await prisma.prescriptionReview.deleteMany({ where: { prescription_id: prescriptionId } });
    await prisma.prescription.delete({ where: { id: prescriptionId } });
    await prisma.user.deleteMany({ where: { id: { in: [patientId, pharmacistId] } } });
    await prisma.drugCatalog.delete({ where: { code: drugCode } });
    await moduleRef.close();
  }, 20000);

  it('rejects setting a real drug_code when no prescription_reviews row exists yet', async () => {
    await expect(
      prisma.$executeRawUnsafe(`UPDATE prescription_items SET drug_code = '${drugCode}' WHERE id = '${itemId}'`),
    ).rejects.toThrow(/prescription_items\.drug_code cannot be set without a corresponding prescription_reviews row/);

    const unchanged = await prisma.prescriptionItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(unchanged.drug_code).toBeNull();
  });

  it('allows setting the same drug_code once a prescription_reviews row exists for the same prescription', async () => {
    await prisma.prescriptionReview.create({
      data: { prescription_id: prescriptionId, pharmacist_user_id: pharmacistId, decision: 'ACCEPTED' },
    });

    await prisma.$executeRawUnsafe(`UPDATE prescription_items SET drug_code = '${drugCode}' WHERE id = '${itemId}'`);

    const updated = await prisma.prescriptionItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(updated.drug_code).toBe(drugCode);
  }, 20000);
});
