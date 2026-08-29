import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { ReviewPrescriptionUseCase } from './review-prescription.use-case';

function buildTx() {
  return {} as any;
}

describe('ReviewPrescriptionUseCase', () => {
  const actor = { sub: 'pharmacist-1', roleMembershipId: 'membership-1', roleCode: 'PHARMACY_STAFF', contextType: 'PHARMACY_STAFF', permissions: [] } as any;
  const prescription = { id: 'prescription-1', status: 'QUALITY_CHECK_PASSED', version: 1 };
  const item = { id: 'item-1', prescription_id: 'prescription-1', version: 1 };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const prescriptions = { findById: jest.fn(), setStatus: jest.fn() };
    const items = { findById: jest.fn(), setDrugCodeAndQuantity: jest.fn(), createReviewed: jest.fn() };
    const reviews = { create: jest.fn() };
    const drugCatalog = { findManyByCode: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new ReviewPrescriptionUseCase(
      prisma as any,
      prescriptions as any,
      items as any,
      reviews as any,
      drugCatalog as any,
      audit as any,
      outbox as any,
    );
    return { tx, prescriptions, items, reviews, drugCatalog, audit, outbox, useCase };
  }

  it('404s when the prescription does not exist', async () => {
    const { prescriptions, useCase } = setup();
    prescriptions.findById.mockResolvedValue(null);

    await expect(useCase.execute('prescription-1', { decision: 'ACCEPTED' }, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('creates the review row before applying item corrections, and sets status ACCEPTED', async () => {
    const { tx, prescriptions, items, reviews, drugCatalog, audit, outbox, useCase } = setup();
    prescriptions.findById.mockResolvedValue(prescription);
    drugCatalog.findManyByCode.mockResolvedValue([{ code: 'PARA500', controlled_substance: false }]);
    reviews.create.mockResolvedValue({ id: 'review-1' });
    items.findById.mockResolvedValue(item);

    const callOrder: string[] = [];
    reviews.create.mockImplementation(async () => {
      callOrder.push('review.create');
      return { id: 'review-1' };
    });
    items.setDrugCodeAndQuantity.mockImplementation(async () => {
      callOrder.push('items.setDrugCodeAndQuantity');
    });

    const result = await useCase.execute(
      'prescription-1',
      { decision: 'ACCEPTED', itemCorrections: [{ prescriptionItemId: 'item-1', drugCode: 'PARA500', quantity: 20 }] },
      actor,
    );

    expect(callOrder).toEqual(['review.create', 'items.setDrugCodeAndQuantity']);
    expect(items.setDrugCodeAndQuantity).toHaveBeenCalledWith(tx, 'item-1', 1, { drugCode: 'PARA500', quantity: 20 });
    expect(prescriptions.setStatus).toHaveBeenCalledWith(tx, 'prescription-1', 1, 'ACCEPTED');
    expect(result).toEqual({ status: 'ACCEPTED' });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'prescriptions.prescription.review' }));
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'PrescriptionAccepted', expect.objectContaining({ prescriptionId: 'prescription-1' }));
  });

  it('creates a brand-new item when itemCorrections omits prescriptionItemId (File 12 Part 37.10)', async () => {
    const { tx, prescriptions, items, drugCatalog, reviews, useCase } = setup();
    prescriptions.findById.mockResolvedValue(prescription);
    drugCatalog.findManyByCode.mockResolvedValue([{ code: 'AMOX250', controlled_substance: false }]);
    reviews.create.mockResolvedValue({ id: 'review-1' });

    const result = await useCase.execute(
      'prescription-1',
      { decision: 'ACCEPTED', itemCorrections: [{ drugCode: 'AMOX250', quantity: 14 }] },
      actor,
    );

    expect(items.findById).not.toHaveBeenCalled();
    expect(items.createReviewed).toHaveBeenCalledWith(tx, 'prescription-1', { drugCode: 'AMOX250', quantity: 14 });
    expect(result).toEqual({ status: 'ACCEPTED' });
  });

  it('leaves the prescription status unchanged and emits no outbox event on NEEDS_CLARIFICATION', async () => {
    const { prescriptions, reviews, outbox, useCase } = setup();
    prescriptions.findById.mockResolvedValue(prescription);
    reviews.create.mockResolvedValue({ id: 'review-1' });

    const result = await useCase.execute('prescription-1', { decision: 'NEEDS_CLARIFICATION', reasonCode: 'dose illegible' }, actor);

    expect(result).toEqual({ status: 'QUALITY_CHECK_PASSED' });
    expect(prescriptions.setStatus).not.toHaveBeenCalled();
    expect(outbox.emit).not.toHaveBeenCalled();
  });

  it('422s with CONTROLLED_SUBSTANCE_CONFIRMATION_REQUIRED when a corrected item is a controlled substance and not confirmed', async () => {
    const { prescriptions, drugCatalog, reviews, useCase } = setup();
    prescriptions.findById.mockResolvedValue(prescription);
    drugCatalog.findManyByCode.mockResolvedValue([{ code: 'TRAMADOL50', controlled_substance: true }]);

    await expect(
      useCase.execute('prescription-1', { decision: 'ACCEPTED', itemCorrections: [{ prescriptionItemId: 'item-1', drugCode: 'TRAMADOL50', quantity: 10 }] }, actor),
    ).rejects.toMatchObject({ code: 'CONTROLLED_SUBSTANCE_CONFIRMATION_REQUIRED', httpStatus: 422 });
    expect(reviews.create).not.toHaveBeenCalled();
  });

  it('succeeds when a controlled-substance item correction is explicitly confirmed', async () => {
    const { prescriptions, drugCatalog, reviews, items, useCase } = setup();
    prescriptions.findById.mockResolvedValue(prescription);
    drugCatalog.findManyByCode.mockResolvedValue([{ code: 'TRAMADOL50', controlled_substance: true }]);
    reviews.create.mockResolvedValue({ id: 'review-1' });
    items.findById.mockResolvedValue(item);

    const result = await useCase.execute(
      'prescription-1',
      { decision: 'ACCEPTED', controlledSubstanceConfirmed: true, itemCorrections: [{ prescriptionItemId: 'item-1', drugCode: 'TRAMADOL50', quantity: 10 }] },
      actor,
    );

    expect(result).toEqual({ status: 'ACCEPTED' });
    expect(reviews.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ controlledSubstanceConfirmed: true }));
  });

  it('404s when an item correction targets an item that does not belong to this prescription', async () => {
    const { prescriptions, drugCatalog, reviews, items, useCase } = setup();
    prescriptions.findById.mockResolvedValue(prescription);
    drugCatalog.findManyByCode.mockResolvedValue([{ code: 'PARA500', controlled_substance: false }]);
    reviews.create.mockResolvedValue({ id: 'review-1' });
    items.findById.mockResolvedValue({ ...item, prescription_id: 'some-other-prescription' });

    await expect(
      useCase.execute('prescription-1', { decision: 'ACCEPTED', itemCorrections: [{ prescriptionItemId: 'item-1', drugCode: 'PARA500', quantity: 20 }] }, actor),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
