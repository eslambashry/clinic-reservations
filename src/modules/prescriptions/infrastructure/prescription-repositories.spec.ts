import { PrescriptionRepository } from './prescription.repository';
import { PrescriptionItemRepository } from './prescription-item.repository';
import { PrescriptionImageRepository } from './prescription-image.repository';
import { DrugCatalogRepository } from './drug-catalog.repository';
import { PrescriptionReviewRepository } from './prescription-review.repository';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

jest.mock('../../../shared/kernel/prisma/optimistic-lock', () => ({ updateWithOptimisticLock: jest.fn().mockResolvedValue(undefined) }));

function makeDb(): any {
  const models: Record<string, any> = {};
  return new Proxy({}, {
    get: (_t, k: string) => {
      if (k.startsWith('$')) {
        return (models[k] ??= jest.fn().mockResolvedValue([]));
      }
      return (models[k] ??= new Proxy({}, { get: (m: any, j: string) => (m[j] ??= jest.fn().mockResolvedValue({ count: 1 })) }));
    },
  });
}

const cursor = { createdAt: '2026-01-01T00:00:00Z', id: 'c' };

describe('PrescriptionRepository', () => {
  const repo = new PrescriptionRepository();

  it('create/findById/lockForReview', async () => {
    const db = makeDb();
    await repo.create(db, { patientId: 'p', source: 'PATIENT_UPLOAD' as any });
    expect(db.prescription.create.mock.calls[0][0].data.patient_id).toBe('p');
    await repo.findById(db, 'x');
    await repo.lockForReview(db, 'x');
    expect(db.$queryRaw).toHaveBeenCalled();
  });

  it('findByDoctorId applies each optional filter', async () => {
    const db = makeDb();
    await repo.findByDoctorId(db, 'd', { limit: 5 });
    expect(db.prescription.findMany.mock.calls[0][0].where.AND).toHaveLength(1);
    await repo.findByDoctorId(db, 'd', { limit: 5, documentType: 'RX' as any, createdByUserId: 'c', status: 'ACCEPTED' as any, cursor });
    expect(db.prescription.findMany.mock.calls[1][0].where.AND).toHaveLength(5);
  });

  it('approve/reject/setStatus go through optimistic lock', async () => {
    (updateWithOptimisticLock as jest.Mock).mockClear();
    const db = makeDb();
    const decision = { decidedByUserId: 'u', decidedAt: new Date(), rejectionReason: 'no' };
    await repo.approve(db, 'x', 1, decision);
    await repo.reject(db, 'x', 1, decision);
    await repo.setStatus(db, 'x', 1, 'ACCEPTED' as any);
    const calls = (updateWithOptimisticLock as jest.Mock).mock.calls;
    expect(calls.map((c) => c[3].status)).toEqual(['ACCEPTED', 'REJECTED', 'ACCEPTED']);
    expect(calls[1][3].rejection_reason).toBe('no');
  });

  it('listQualityCheckPassed with and without cursor', async () => {
    const db = makeDb();
    await repo.listQualityCheckPassed(db, { limit: 3 });
    expect(db.prescription.findMany.mock.calls[0][0].where.OR).toBeUndefined();
    await repo.listQualityCheckPassed(db, { limit: 3, cursor });
    expect(db.prescription.findMany.mock.calls[1][0].where.OR).toHaveLength(2);
  });
});

describe('PrescriptionItemRepository', () => {
  const repo = new PrescriptionItemRepository();
  it('covers all methods and empty-ids shortcut', async () => {
    const db = makeDb();
    await repo.createManySuggested(db, 'p', [{ drugNameFreeText: 'a', dose: '1', frequency: 'f', durationDays: 1, quantity: 1 } as any]);
    expect(db.prescriptionItem.createMany.mock.calls[0][0].data[0].drug_name_free_text).toBe('a');
    await repo.findByPrescriptionId(db, 'p');
    await repo.findById(db, 'i');
    expect(await repo.findManyByIds(db, [])).toEqual([]);
    await repo.findManyByIds(db, ['i']);
    expect(db.prescriptionItem.findMany).toHaveBeenCalledTimes(2);
    await repo.setDrugCodeAndQuantity(db, 'i', 1, { drugCode: 'D', quantity: 2 });
    await repo.createReviewed(db, 'p', { drugCode: 'D', quantity: 2 });
    expect(db.prescriptionItem.create).toHaveBeenCalled();
  });
});

describe('PrescriptionImageRepository', () => {
  it('maps quality check to PASSED/FAILED', async () => {
    const db = makeDb();
    const repo = new PrescriptionImageRepository();
    await repo.createMany(db, [
      { prescriptionId: 'p', fileUrl: 'u', qualityCheck: { passed: true, blurScore: 1 } as any },
      { prescriptionId: 'p', fileUrl: 'u2', qualityCheck: { passed: false, blurScore: 0 } as any },
    ]);
    expect(db.prescriptionImage.createMany.mock.calls[0][0].data.map((d: any) => d.quality_check_status)).toEqual(['PASSED', 'FAILED']);
    await repo.findByPrescriptionId(db, 'p');
    expect(db.prescriptionImage.findMany).toHaveBeenCalled();
  });
});

describe('DrugCatalogRepository / PrescriptionReviewRepository', () => {
  it('drug catalog short-circuits empty codes', async () => {
    const db = makeDb();
    const repo = new DrugCatalogRepository();
    expect(await repo.findManyByCode(db, [])).toEqual([]);
    await repo.findManyByCode(db, ['a']);
    expect(db.drugCatalog.findMany).toHaveBeenCalledTimes(1);
  });
  it('review repo create and find', async () => {
    const db = makeDb();
    const repo = new PrescriptionReviewRepository();
    await repo.create(db, { prescriptionId: 'p', pharmacistUserId: 'u', decision: 'ACCEPTED' as any, controlledSubstanceConfirmed: true });
    await repo.findByPrescriptionId(db, 'p');
    expect(db.prescriptionReview.create.mock.calls[0][0].data.controlled_substance_confirmed).toBe(true);
  });
});
