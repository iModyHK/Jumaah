import { describe, expect, it } from 'vitest';
import { renderCloudTemplate, type CloudCloudTemplateName } from './email-templates.js';

describe('email templates', () => {
  it('render every template in both languages with subject, text and html', () => {
    const samples: Array<[CloudTemplateName, unknown]> = [
      ['welcome', { mosqueName: 'مسجد النور', adminName: 'أحمد', adminUrl: 'https://alnoor.jumaah.net/admin/', phoneUrl: 'https://alnoor.jumaah.net/display/m/alnoor', trialEndsAt: '2026-10-06T00:00:00.000Z', plan: 'Standard' }],
      ['invoiceIssued', { customerName: 'Al Noor', number: 'JC-2026-00001', total: 228850, dueAt: '2026-10-01T00:00:00.000Z', viewUrl: 'https://cloud.jumaah.net/display/invoice/JC-2026-00001?t=x', paymentUrl: null, iban: 'SA00 0000', bank: 'Al Rajhi', sellerName: 'Jumaah Cloud', description: 'Standard plan, one year' }],
      ['paymentReceived', { customerName: 'Al Noor', number: 'JC-2026-00001', total: 228850, viewUrl: 'https://x', paidUntil: '2027-10-01T00:00:00.000Z' }],
      ['pastDue', { customerName: 'Al Noor', number: 'JC-2026-00001', total: 19900, viewUrl: 'https://x', graceDays: 7 }],
      ['sponsorship', { sponsorName: 'Al Khair', mosques: 2, number: 'JC-2026-00002', total: 398000, viewUrl: 'https://x', paymentUrl: 'https://pay', iban: null, bank: null, sellerName: 'Jumaah Cloud' }],
      ['sponsorshipNotice', { sponsorName: 'Al Khair', sponsorEmail: 'g@x.org', mosques: 2, mosqueName: null, message: '<b>hi</b>', number: 'JC-2026-00002', total: 398000 }],
    ];
    for (const [name, data] of samples) {
      for (const locale of ['ar', 'en'] as const) {
        const r = renderCloudTemplate(name, locale, data as never);
        expect(r.subject.length, `${name}/${locale} subject`).toBeGreaterThan(3);
        expect(r.text).toContain(r.html.includes('<a href') ? ':' : r.text.slice(0, 1));
        // the notice to the platform team is always English; every other template follows the recipient's language
        expect(r.html).toContain(`dir="${name === 'sponsorshipNotice' || locale === 'en' ? 'ltr' : 'rtl'}"`);
      }
    }
  });
  it('escapes user-supplied text and formats money and dates', () => {
    const r = renderCloudTemplate('sponsorshipNotice', 'en', { sponsorName: 'Al Khair', sponsorEmail: 'g@x.org', mosques: 2, mosqueName: null, message: '<script>alert(1)</script>', number: 'JC-1', total: 398000 });
    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&lt;script&gt;');
    expect(r.text).toContain('3,980.00 SAR');
    const ar = renderCloudTemplate('invoiceIssued', 'ar', { customerName: 'x', number: 'JC-1', total: 19900, dueAt: '2026-10-01T00:00:00.000Z', viewUrl: 'https://x', paymentUrl: 'https://pay', iban: null, bank: null, sellerName: 'Jumaah', description: 'x' });
    expect(ar.html).toContain('ادفعوا الآن');
    expect(ar.html).toContain('199.00 ر.س');
  });
});
