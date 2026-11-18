import { NOTIFICATION_TEMPLATES } from './notification-templates';

describe('NOTIFICATION_TEMPLATES', () => {
  const rich = {
    patientId: 'u1', payerUserId: 'u1', recipientUserId: 'u1', doctorUserId: 'u1', clinicStaffUserId: 'u1',
    adminUserId: 'u1', userId: 'u1', assistantUserId: 'u1', createdByUserId: 'u1', labStaffUserId: 'u1', pharmacyStaffUserId: 'u1', appointmentId: 'a1', amount: 10, currency: 'USD', status: 'X',
  };

  it.each(Object.entries(NOTIFICATION_TEMPLATES))('%s renders a non-empty message', (_name, t) => {
    expect(t.channels).toContain('PUSH');
    for (const payload of [rich, {}]) {
      const r = t.render(payload);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.body.length).toBeGreaterThan(0);
    }
    expect(t.extractUserId(rich)).toBe('u1');
    expect(t.extractUserId({})).toBeUndefined();
  });

  describe('ProviderPharmacyOrderStatusChanged', () => {
    const t = NOTIFICATION_TEMPLATES.ProviderPharmacyOrderStatusChanged;
    it.each([
      ['READY_FOR_PICKUP', undefined, 'طلب الدواء جاهز'],
      ['OUT_FOR_DELIVERY', 'CLINIC_HANDOVER', 'طلب الدواء في الطريق إلى العيادة'],
      ['OUT_FOR_DELIVERY', 'DELIVERY', 'طلب الدواء في الطريق إليك'],
      ['FULFILLED', undefined, 'اكتمل طلب الدواء'],
      ['OUT_FOR_DELIVERY', 'PICKUP', 'تحديث على طلب الدواء'],
      ['OTHER', undefined, 'تحديث على طلب الدواء'],
    ])('%s/%s', (status, fulfillmentType, title) => {
      expect(t.render({ status, fulfillmentType, pharmacyOrderId: 'o' }).title).toBe(title);
    });
  });

  describe('doctor verification template', () => {
    const entry = Object.values(NOTIFICATION_TEMPLATES).find((t) => t.extractUserId({ adminUserId: 'adm' }) === 'adm' && t.render({}).title === 'طلب توثيق طبيب جديد')!;
    it('uses name and specialty when present', () => {
      const r = entry.render({ doctorName: ' Dr X ', specialtyLabel: 'Cardio', doctorPhone: '1' });
      expect(r.body).toContain('Dr X');
      expect(r.body).toContain('Cardio');
      expect(r.data).toMatchObject({ doctorName: 'Dr X', doctorPhone: '1' });
    });
    it('omits specialty when absent', () => {
      expect(entry.render({ doctorName: 'Dr X' }).body).not.toContain('تخصص');
    });
    it('falls back to generic wording without a name', () => {
      const r = entry.render({ doctorName: '  ' });
      expect(r.data).toMatchObject({ doctorName: null, doctorPhone: null });
    });
  });
});
