import { LegalController } from './legal.controller';

describe('LegalController', () => {
  const c = new LegalController();

  it('serves the three public Arabic RTL pages', () => {
    for (const html of [c.privacy(), c.terms(), c.deleteAccount()]) {
      expect(html).toContain('<html lang="ar" dir="rtl">');
    }
    expect(c.privacy()).toContain('سياسة الخصوصية');
    expect(c.terms()).toContain('الشروط والأحكام');
    expect(c.deleteAccount()).toContain('حذف الحساب');
  });
});
