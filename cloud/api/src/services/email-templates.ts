/** Email templates of Jumaah Cloud (invoices, sponsorship, trial notices, welcome), on the core's layout helpers. */
import { FOOT, buildEmail, dateLabel, esc, type Locale, type RenderedEmail } from '@jumaah/api';
import { formatSar } from '@jumaah/cloud-shared';

export interface CloudTemplateData {
  welcome: { mosqueName: string; adminName: string; adminUrl: string; phoneUrl: string; trialEndsAt: string | null; plan: string };
  invoiceIssued: { customerName: string; number: string; total: number; dueAt: string; viewUrl: string; paymentUrl: string | null; iban: string | null; bank: string | null; sellerName: string; description: string };
  paymentReceived: { customerName: string; number: string; total: number; viewUrl: string; paidUntil: string | null };
  pastDue: { customerName: string; number: string; total: number; viewUrl: string; graceDays: number };
  sponsorship: { sponsorName: string; mosques: number; number: string; total: number; viewUrl: string; paymentUrl: string | null; iban: string | null; bank: string | null; sellerName: string };
  sponsorshipNotice: { sponsorName: string; sponsorEmail: string; mosques: number; mosqueName: string | null; message: string | null; number: string; total: number };
  trialEnding: { mosqueName: string; endsAt: string; plan: string; adminUrl: string; daysLeft: number };
  trialEnded: { mosqueName: string; adminUrl: string };
}

export type CloudTemplateName = keyof CloudTemplateData;

const money = (h: number, locale: Locale) => `${formatSar(h, locale)} ${locale === 'ar' ? 'ر.س' : 'SAR'}`;

function payLine(locale: Locale, d: { paymentUrl: string | null; iban: string | null; bank: string | null; sellerName: string; number: string }): string {
  if (d.paymentUrl) return locale === 'ar' ? `يمكنكم الدفع إلكترونياً عبر مدى أو Apple Pay أو البطاقة من رابط الدفع أدناه.` : `You can pay online by mada, Apple Pay or card from the link below.`;
  if (d.iban) return locale === 'ar' ? `الدفع بالتحويل البنكي إلى: ${esc(d.bank ?? '')} · IBAN <span dir="ltr">${esc(d.iban)}</span> · المستفيد ${esc(d.sellerName)} · مع ذكر رقم الفاتورة ${esc(d.number)}.` : `Pay by bank transfer to ${esc(d.bank ?? '')} · IBAN <span dir="ltr">${esc(d.iban)}</span> · beneficiary ${esc(d.sellerName)}, quoting invoice ${esc(d.number)}.`;
  return locale === 'ar' ? 'تجدون طريقة الدفع على الفاتورة.' : 'Payment details are on the invoice.';
}

export function renderCloudTemplate<K extends CloudTemplateName>(name: K, locale: Locale, d: CloudTemplateData[K]): RenderedEmail {
  const ar = locale === 'ar';
  switch (name) {
    case 'welcome': {
      const x = d as CloudTemplateData['welcome'];
      return buildEmail(
        locale,
        ar ? `مسجدكم جاهز على جُمعة كلاود: ${x.mosqueName}` : `Your mosque is ready on Jumaah Cloud: ${x.mosqueName}`,
        ar ? `أهلاً ${x.adminName}، مسجدكم جاهز.` : `Welcome ${x.adminName}, your mosque is ready.`,
        [
          ar ? `أُنشئ <b>${esc(x.mosqueName)}</b> على الباقة ${esc(x.plan)}. لوحة الإدارة: <a href="${esc(x.adminUrl)}">${esc(x.adminUrl)}</a>، وصفحة المصلّين: <a href="${esc(x.phoneUrl)}">${esc(x.phoneUrl)}</a>.` : `<b>${esc(x.mosqueName)}</b> was created on the ${esc(x.plan)} plan. Admin: <a href="${esc(x.adminUrl)}">${esc(x.adminUrl)}</a>. Worshippers' page: <a href="${esc(x.phoneUrl)}">${esc(x.phoneUrl)}</a>.`,
          x.trialEndsAt ? (ar ? `تنتهي التجربة المجانية في ${dateLabel(x.trialEndsAt, locale)}. يمكنكم الاشتراك في أي وقت من الإعدادات ← الاشتراك.` : `Your free trial ends on ${dateLabel(x.trialEndsAt, locale)}. Subscribe at any time from Settings → Subscription.`) : '',
          ar ? 'الخطوة التالية: أضيفوا الشاشات من «الشاشات» ثم ارفعوا أول خطبة.' : 'Next: add your screens under Displays, then upload the first khutbah.',
        ].filter(Boolean),
        { label: ar ? 'افتح لوحة الإدارة' : 'Open the admin', url: x.adminUrl },
        FOOT[locale],
      );
    }
    case 'invoiceIssued': {
      const x = d as CloudTemplateData['invoiceIssued'];
      return buildEmail(
        locale,
        ar ? `فاتورة ${x.number} · ${money(x.total, locale)}` : `Invoice ${x.number} · ${money(x.total, locale)}`,
        ar ? `فاتورة جديدة لـ ${x.customerName}` : `New invoice for ${x.customerName}`,
        [
          ar ? `${esc(x.description)}. الإجمالي <b>${money(x.total, locale)}</b>، الاستحقاق ${dateLabel(x.dueAt, locale)}.` : `${esc(x.description)}. Total <b>${money(x.total, locale)}</b>, due ${dateLabel(x.dueAt, locale)}.`,
          payLine(locale, x),
        ],
        { label: x.paymentUrl ? (ar ? 'ادفعوا الآن' : 'Pay now') : ar ? 'عرض الفاتورة' : 'View the invoice', url: x.paymentUrl ?? x.viewUrl },
        ar ? `رابط الفاتورة: ${x.viewUrl}` : `Invoice link: ${x.viewUrl}`,
      );
    }
    case 'paymentReceived': {
      const x = d as CloudTemplateData['paymentReceived'];
      return buildEmail(
        locale,
        ar ? `تم استلام الدفعة · ${x.number}` : `Payment received · ${x.number}`,
        ar ? `شكراً لكم، تم استلام الدفعة.` : `Thank you, your payment was received.`,
        [
          ar ? `الفاتورة ${esc(x.number)} بمبلغ <b>${money(x.total, locale)}</b> مدفوعة.` : `Invoice ${esc(x.number)} for <b>${money(x.total, locale)}</b> is paid.`,
          x.paidUntil ? (ar ? `اشتراككم ساري حتى ${dateLabel(x.paidUntil, locale)}.` : `Your subscription runs until ${dateLabel(x.paidUntil, locale)}.`) : '',
        ].filter(Boolean),
        { label: ar ? 'عرض الفاتورة' : 'View the invoice', url: x.viewUrl },
        FOOT[locale],
      );
    }
    case 'pastDue': {
      const x = d as CloudTemplateData['pastDue'];
      return buildEmail(
        locale,
        ar ? `فاتورة متأخرة · ${x.number}` : `Overdue invoice · ${x.number}`,
        ar ? `الفاتورة ${x.number} لم تُسدَّد بعد` : `Invoice ${x.number} is still unpaid`,
        [
          ar ? `مبلغ <b>${money(x.total, locale)}</b> تجاوز تاريخ الاستحقاق. تبقى الخطب والشاشات كما هي؛ تتوقف الترجمة الآلية للمنصة بعد ${x.graceDays} أيام من انتهاء الاشتراك حتى السداد.` : `<b>${money(x.total, locale)}</b> is past its due date. Khutbahs and screens keep working; platform AI translation pauses ${x.graceDays} days after the subscription ends until the invoice is paid.`,
        ],
        { label: ar ? 'عرض الفاتورة' : 'View the invoice', url: x.viewUrl },
        FOOT[locale],
      );
    }
    case 'sponsorship': {
      const x = d as CloudTemplateData['sponsorship'];
      return buildEmail(
        locale,
        ar ? `رعاية مسجد · الفاتورة ${x.number}` : `Sponsor a mosque · invoice ${x.number}`,
        ar ? `جزاكم الله خيراً، ${x.sponsorName}` : `Thank you, ${x.sponsorName}`,
        [
          ar ? `رعايتكم لعدد ${x.mosques} من المساجد لسنة كاملة جاهزة. الإجمالي <b>${money(x.total, locale)}</b>.` : `Your sponsorship of ${x.mosques} mosque(s) for a full year is ready. Total <b>${money(x.total, locale)}</b>.`,
          payLine(locale, x),
          ar ? 'بعد وصول الدفعة نفعّل المسجد ونخبركم به.' : 'Once the payment arrives we activate the mosque and let you know.',
        ],
        { label: x.paymentUrl ? (ar ? 'ادفعوا الآن' : 'Pay now') : ar ? 'عرض الفاتورة' : 'View the invoice', url: x.paymentUrl ?? x.viewUrl },
        ar ? `رابط الفاتورة: ${x.viewUrl}` : `Invoice link: ${x.viewUrl}`,
      );
    }
    case 'sponsorshipNotice': {
      const x = d as CloudTemplateData['sponsorshipNotice'];
      return buildEmail(
        'en',
        `New sponsorship: ${x.sponsorName} · ${x.mosques} mosque(s) · ${x.number}`,
        `New sponsorship from ${x.sponsorName}`,
        [`${esc(x.sponsorEmail)} · ${x.mosques} mosque(s) · ${money(x.total, 'en')} · invoice ${esc(x.number)}`, x.mosqueName ? `Requested mosque: ${esc(x.mosqueName)}` : '', x.message ? `Message: ${esc(x.message)}` : ''].filter(Boolean),
        null,
        'Apply the seats from Admin → Platform → Billing once the invoice is paid.',
      );
    }
    case 'trialEnding': {
      const x = d as CloudTemplateData['trialEnding'];
      return buildEmail(
        locale,
        ar ? `تنتهي تجربة ${x.mosqueName} خلال ${x.daysLeft} أيام` : `${x.mosqueName}: your trial ends in ${x.daysLeft} days`,
        ar ? 'تجربتكم المجانية تقارب نهايتها' : 'Your free trial is almost over',
        [
          ar
            ? `تنتهي تجربة الباقة ${esc(x.plan)} لمسجد <b>${esc(x.mosqueName)}</b> في ${dateLabel(x.endsAt, locale)}. للاستمرار اشتركوا من الإعدادات ← الاشتراك؛ وإلا يعود المسجد إلى الباقة المجانية دون فقدان أي شيء.`
            : `The ${esc(x.plan)} trial for <b>${esc(x.mosqueName)}</b> ends on ${dateLabel(x.endsAt, locale)}. To keep going, subscribe from Settings → Subscription; otherwise the mosque returns to the free plan and nothing is lost.`,
        ],
        { label: ar ? 'الاشتراك الآن' : 'Subscribe now', url: `${x.adminUrl}settings` },
        FOOT[locale],
      );
    }
    case 'trialEnded': {
      const x = d as CloudTemplateData['trialEnded'];
      return buildEmail(
        locale,
        ar ? `انتهت تجربة ${x.mosqueName}` : `${x.mosqueName}: the trial has ended`,
        ar ? 'انتهت التجربة المجانية' : 'Your free trial has ended',
        [
          ar
            ? `عاد <b>${esc(x.mosqueName)}</b> إلى الباقة المجانية: الخطب والشاشات والجوالات تعمل كما هي، وتوقفت ميزات الباقات المدفوعة فقط. يمكنكم الاشتراك في أي وقت لإعادتها.`
            : `<b>${esc(x.mosqueName)}</b> is back on the free plan: khutbahs, screens and phones keep working; only the paid features paused. Subscribe at any time to bring them back.`,
        ],
        { label: ar ? 'الاشتراك' : 'Subscribe', url: `${x.adminUrl}settings` },
        FOOT[locale],
      );
    }
  }
  throw new Error(`Unknown template ${String(name)}`);
}

/** The core's emailTemplates hook: every cloud template by name. */
export const cloudEmailTemplates: Record<string, (locale: Locale, data: Record<string, unknown>) => RenderedEmail> = Object.fromEntries(
  (['welcome', 'invoiceIssued', 'paymentReceived', 'pastDue', 'sponsorship', 'sponsorshipNotice', 'trialEnding', 'trialEnded'] as const).map((n) => [n, (locale: Locale, data: Record<string, unknown>) => renderCloudTemplate(n, locale, data as never)]),
);
