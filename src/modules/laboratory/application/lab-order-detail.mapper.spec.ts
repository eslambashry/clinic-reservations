import { buildLabOrderDetail } from './lab-order-detail.mapper';

const dec = (v: string) => ({ toFixed: (n: number) => Number(v).toFixed(n) }) as any;
const d = (s: string) => new Date(s);

function order(over: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    status: 'QUOTED',
    collection_type: 'VISIT',
    created_at: d('2026-01-01T00:00:00Z'),
    updated_at: d('2026-01-02T00:00:00Z'),
    lab_branch_id: 'b1',
    doctor_id: null,
    total_price: null,
    currency: null,
    appointment_at: null,
    quoted_at: null,
    prep_instructions: null,
    booking_code: null,
    queue_number: null,
    rejection_reason: null,
    rejection_note: null,
    rejected_at: null,
    recollection_required: false,
    ...over,
  } as any;
}

const patient = { id: 'p1', firstName: 'A', lastName: 'B', phoneMasked: '+20*****1' } as any;

describe('buildLabOrderDetail', () => {
  it('maps a minimal patient-originated order with nulls', () => {
    const result = buildLabOrderDetail(order(), patient, null, [], [], [], []);
    expect(result).toMatchObject({
      id: 'o1',
      origin: 'PATIENT',
      branchId: 'b1',
      patient: { id: 'p1', firstName: 'A', lastName: 'B', phoneMasked: '+20*****1' },
      items: [],
      quote: null,
      rejection: null,
      prescriptionImages: [],
      patientNote: null,
      bookingCode: null,
      queueNumber: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('maps a provider order with quote, items, results, rejection and prescription images', () => {
    const o = order({
      doctor_id: 'doc',
      total_price: dec('100'),
      currency: 'EGP',
      appointment_at: d('2026-02-01T10:00:00Z'),
      quoted_at: d('2026-01-03T00:00:00Z'),
      prep_instructions: 'fast',
      booking_code: 'BK',
      queue_number: 2,
      rejection_reason: 'r',
      rejection_note: 'n',
      rejected_at: d('2026-01-05T00:00:00Z'),
      recollection_required: true,
    });
    const items = [
      { id: 'i1', test_name: 'CBC', unit_price: dec('50'), result_state: 'RECORDED' },
      { id: 'i2', test_name: 'TSH', unit_price: null, result_state: 'PENDING' },
    ] as any;
    const results = [
      {
        id: 'r1',
        lab_order_id: 'o1',
        item_id: 'i1',
        file_label: 'f',
        file_url: 'u',
        size_kb: 4,
        uploaded_at: d('2026-01-04T00:00:00Z'),
        uploaded_by: 'staff',
        is_critical: true,
        review_state: 'REVIEWED',
      },
    ] as any;
    const events = [
      { id: 'e1', orderId: 'o1', type: 'QUOTE_SENT', at: 'x', actorName: 'Old', note: null },
      { id: 'e2', orderId: 'o1', type: 'QUOTE_SENT', at: 'y', actorName: 'Latest', note: null },
    ] as any;
    const notes = [{ id: 'n1', at: 'z', author: 'a', body: 'b' }];
    const prescription = { images: [{ id: 'img', fileUrl: 'http://img' }] } as any;

    const result = buildLabOrderDetail(o, patient, prescription, items, results, events, notes);

    expect(result.origin).toBe('PROVIDER');
    expect(result.items).toEqual([
      { id: 'i1', testName: 'CBC', unitPrice: '50.00', resultState: 'RECORDED', resultId: 'r1' },
      { id: 'i2', testName: 'TSH', unitPrice: null, resultState: 'PENDING', resultId: null },
    ]);
    expect(result.quote).toEqual({
      totalPrice: '100.00',
      currency: 'EGP',
      appointmentAt: '2026-02-01T10:00:00.000Z',
      prepInstructions: 'fast',
      quotedAt: '2026-01-03T00:00:00.000Z',
      quotedBy: 'Latest',
    });
    expect(result.results[0]).toMatchObject({ id: 'r1', itemId: 'i1', isCritical: true, uploadedAt: '2026-01-04T00:00:00.000Z' });
    expect(result.rejection).toEqual({ reason: 'r', note: 'n', at: '2026-01-05T00:00:00.000Z' });
    expect(result.prescriptionImages).toEqual([{ id: 'img', fileUrl: 'http://img' }]);
    expect(result.recollectionRequired).toBe(true);
    expect(result.notes).toBe(notes);
    expect(result.custodyEvents).toBe(events);
    // input array must not be mutated by the reverse lookup
    expect(events[0].actorName).toBe('Old');
  });

  it('falls back to empty strings when the quote has no prep instructions or QUOTE_SENT event', () => {
    const o = order({
      total_price: dec('10'),
      currency: 'EGP',
      appointment_at: d('2026-02-01T10:00:00Z'),
      quoted_at: d('2026-01-03T00:00:00Z'),
    });
    const result = buildLabOrderDetail(o, patient, null, [], [], [], []);
    expect(result.quote).toMatchObject({ prepInstructions: '', quotedBy: '' });
  });
});
