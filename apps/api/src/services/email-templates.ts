/**
 * Transactional email templates, Arabic and English. Each template returns a subject, a plain-text body and an HTML
 * body built on one small layout. Money arrives as halalas; dates as ISO strings.
 */
import { formatSar } from '@jumaah/shared';

export type Locale = 'ar' | 'en';

export interface Rendered {
  subject: string;
  text: string;
  html: string;
}

export interface TemplateData {
  welcome: { mosqueName: string; adminName: string; adminUrl: string; phoneUrl: string; trialEndsAt: string | null; plan: string };
  passwordReset: { name: string; resetUrl: string; mosqueName: string | null; expiresMinutes: number };
  invoiceIssued: { customerName: string; number: string; total: number; dueAt: string; viewUrl: string; paymentUrl: string | null; iban: string | null; bank: string | null; sellerName: string; description: string };
  paymentReceived: { customerName: string; number: string; total: number; viewUrl: string; paidUntil: string | null };
  pastDue: { customerName: string; number: string; total: number; viewUrl: string; graceDays: number };
  sponsorship: { sponsorName: string; mosques: number; number: string; total: number; viewUrl: string; paymentUrl: string | null; iban: string | null; bank: string | null; sellerName: string };
  sponsorshipNotice: { sponsorName: string; sponsorEmail: string; mosques: number; mosqueName: string | null; message: string | null; number: string; total: number };
  trialEnding: { mosqueName: string; endsAt: string; plan: string; adminUrl: string; daysLeft: number };
  trialEnded: { mosqueName: string; adminUrl: string };
  test: { sentBy: string };
}

export type TemplateName = keyof TemplateData;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function date(iso: string | null, locale: Locale): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

const money = (h: number, locale: Locale) => `${formatSar(h, locale)} ${locale === 'ar' ? 'ر.س' : 'SAR'}`;

/** The shared layout: brand line, title, paragraphs, an optional button, a footer. */
function layout(locale: Locale, title: string, paragraphs: string[], button: { label: string; url: string } | null, footer: string): Rendered['html'] {
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const font = locale === 'ar' ? "'Noto Naskh Arabic', 'Segoe UI', Tahoma, sans-serif" : "'Segoe UI', Helvetica, Arial, sans-serif";
  return `<!doctype html><html lang="${locale}" dir="${dir}"><body style="margin:0;background:#f3f5f4;font-family:${font};color:#16211c">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #e1e5e3">
<tr><td style="padding:20px 28px 0;font-weight:800;font-size:18px;color:#1e6b58">${locale === 'ar' ? 'جُمعة' : 'Jumaah'}</td></tr>
<tr><td style="padding:12px 28px 0;font-size:22px;font-weight:800">${esc(title)}</td></tr>
${paragraphs.map((p) => `<tr><td style="padding:12px 28px 0;font-size:16px;line-height:1.7">${p}</td></tr>`).join('')}
${button ? `<tr><td style="padding:20px 28px 0"><a href="${esc(button.url)}" style="display:inline-block;background:#1e6b58;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">${esc(button.label)}</a></td></tr>` : ''}
<tr><td style="padding:24px 28px 20px;font-size:13px;color:#7d8a84;border-top:1px solid #e1e5e3;margin-top:20px">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
}

function build(locale: Locale, subject: string, title: string, paragraphs: string[], button: { label: string; url: string } | null, footer: string): Rendered {
  const text = [title, '', ...paragraphs.map((p) => p.replace(/<[^>]+>/g, '')), ...(button ? ['', `${button.label}: ${button.url}`] : []), '', footer].join('\n');
  return { subject, text, html: layout(locale, title, paragraphs, button, footer) };
}

const FOOT: Record<Locale, string> = { ar: 'جُمعة · ترجمة خطبة الجمعة مباشرةً على شاشات المسجد', en: 'Jumaah · live Friday khutbah translation for mosques' };

function payLine(locale: Locale, d: { paymentUrl: string | null; iban: string | null; bank: string | null; sellerName: string; number: string }): string {
  if (d.paymentUrl) return locale === 'ar' ? `يمكنكم الدفع إلكترونياً عبر مدى أو Apple Pay أو البطاقة من رابط الدفع أدناه.` : `You can pay online by mada, Apple Pay or card from the link below.`;
  if (d.iban) return locale === 'ar' ? `الدفع بالتحويل البنكي إلى: ${esc(d.bank ?? '')} · IBAN <span dir="ltr">${esc(d.iban)}</span> · المستفيد ${esc(d.sellerName)} · مع ذكر رقم الفاتورة ${esc(d.number)}.` : `Pay by bank transfer to ${esc(d.bank ?? '')} · IBAN <span dir="ltr">${esc(d.iban)}</span> · beneficiary ${esc(d.sellerName)}, quoting invoice ${esc(d.number)}.`;
  return locale === 'ar' ? 'تجدون طريقة الدفع على الفاتورة.' : 'Payment details are on the invoice.';
}

export function renderTemplate<K extends TemplateName>(name: K, locale: Locale, d: TemplateData[K]): Rendered {
  const ar = locale === 'ar';
  switch (name) {
    case 'welcome': {
      const x = d as TemplateData['welcome'];
      return build(
        locale,
        ar ? `مسجدكم جاهز على جُمعة كلاود: ${x.mosqueName}` : `Your mosque is ready on Jumaah Cloud: ${x.mosqueName}`,
        ar ? `أهلاً ${x.adminName}، مسجدكم جاهز.` : `Welcome ${x.adminName}, your mosque is ready.`,
        [
          ar ? `أُنشئ <b>${esc(x.mosqueName)}</b> على الباقة ${esc(x.plan)}. لوحة الإدارة: <a href="${esc(x.adminUrl)}">${esc(x.adminUrl)}</a>، وصفحة المصلّين: <a href="${esc(x.phoneUrl)}">${esc(x.phoneUrl)}</a>.` : `<b>${esc(x.mosqueName)}</b> was created on the ${esc(x.plan)} plan. Admin: <a href="${esc(x.adminUrl)}">${esc(x.adminUrl)}</a>. Worshippers' page: <a href="${esc(x.phoneUrl)}">${esc(x.phoneUrl)}</a>.`,
          x.trialEndsAt ? (ar ? `تنتهي التجربة المجانية في ${date(x.trialEndsAt, locale)}. يمكنكم الاشتراك في أي وقت من الإعدادات ← الاشتراك.` : `Your free trial ends on ${date(x.trialEndsAt, locale)}. Subscribe at any time from Settings → Subscription.`) : '',
          ar ? 'الخطوة التالية: أضيفوا الشاشات من «الشاشات» ثم ارفعوا أول خطبة.' : 'Next: add your screens under Displays, then upload the first khutbah.',
        ].filter(Boolean),
        { label: ar ? 'افتح لوحة الإدارة' : 'Open the admin', url: x.adminUrl },
        FOOT[locale],
      );
    }
    case 'passwordReset': {
      const x = d as TemplateData['passwordReset'];
      return build(
        locale,
        ar ? 'إعادة تعيين كلمة المرور' : 'Reset your password',
        ar ? `مرحباً ${x.name}` : `Hello ${x.name}`,
        [
          ar ? `طُلبت إعادة تعيين كلمة المرور لحسابكم${x.mosqueName ? ` في ${esc(x.mosqueName)}` : ''}. الرابط صالح لمدة ${x.expiresMinutes} دقيقة.` : `A password reset was requested for your account${x.mosqueName ? ` at ${esc(x.mosqueName)}` : ''}. The link is valid for ${x.expiresMinutes} minutes.`,
          ar ? 'إن لم تطلبوا ذلك فتجاهلوا هذه الرسالة؛ كلمة المرور لم تتغير.' : 'If you did not ask for this, ignore this message; your password has not changed.',
        ],
        { label: ar ? 'تعيين كلمة مرور جديدة' : 'Choose a new password', url: x.resetUrl },
        FOOT[locale],
      );
    }
    case 'invoiceIssued': {
      const x = d as TemplateData['invoiceIssued'];
      return build(
        locale,
        ar ? `فاتورة ${x.number} · ${money(x.total, locale)}` : `Invoice ${x.number} · ${money(x.total, locale)}`,
        ar ? `فاتورة جديدة لـ ${x.customerName}` : `New invoice for ${x.customerName}`,
        [
          ar ? `${esc(x.description)}. الإجمالي <b>${money(x.total, locale)}</b>، الاستحقاق ${date(x.dueAt, locale)}.` : `${esc(x.description)}. Total <b>${money(x.total, locale)}</b>, due ${date(x.dueAt, locale)}.`,
          payLine(locale, x),
        ],
        { label: x.paymentUrl ? (ar ? 'ادفعوا الآن' : 'Pay now') : ar ? 'عرض الفاتورة' : 'View the invoice', url: x.paymentUrl ?? x.viewUrl },
        ar ? `رابط الفاتورة: ${x.viewUrl}` : `Invoice link: ${x.viewUrl}`,
      );
    }
    case 'paymentReceived': {
      const x = d as TemplateData['paymentReceived'];
      return build(
        locale,
        ar ? `تم استلام الدفعة · ${x.number}` : `Payment received · ${x.number}`,
        ar ? `شكراً لكم، تم استلام الدفعة.` : `Thank you, your payment was received.`,
        [
          ar ? `الفاتورة ${esc(x.number)} بمبلغ <b>${money(x.total, locale)}</b> مدفوعة.` : `Invoice ${esc(x.number)} for <b>${money(x.total, locale)}</b> is paid.`,
          x.paidUntil ? (ar ? `اشتراككم ساري حتى ${date(x.paidUntil, locale)}.` : `Your subscription runs until ${date(x.paidUntil, locale)}.`) : '',
        ].filter(Boolean),
        { label: ar ? 'عرض الفاتورة' : 'View the invoice', url: x.viewUrl },
        FOOT[locale],
      );
    }
    case 'pastDue': {
      const x = d as TemplateData['pastDue'];
      return build(
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
      const x = d as TemplateData['sponsorship'];
      return build(
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
      const x = d as TemplateData['sponsorshipNotice'];
      return build(
        'en',
        `New sponsorship: ${x.sponsorName} · ${x.mosques} mosque(s) · ${x.number}`,
        `New sponsorship from ${x.sponsorName}`,
        [`${esc(x.sponsorEmail)} · ${x.mosques} mosque(s) · ${money(x.total, 'en')} · invoice ${esc(x.number)}`, x.mosqueName ? `Requested mosque: ${esc(x.mosqueName)}` : '', x.message ? `Message: ${esc(x.message)}` : ''].filter(Boolean),
        null,
        'Apply the seats from Admin → Platform → Billing once the invoice is paid.',
      );
    }
    case 'trialEnding': {
      const x = d as TemplateData['trialEnding'];
      return build(
        locale,
        ar ? `تنتهي تجربة ${x.mosqueName} خلال ${x.daysLeft} أيام` : `${x.mosqueName}: your trial ends in ${x.daysLeft} days`,
        ar ? 'تجربتكم المجانية تقارب نهايتها' : 'Your free trial is almost over',
        [
          ar
            ? `تنتهي تجربة الباقة ${esc(x.plan)} لمسجد <b>${esc(x.mosqueName)}</b> في ${date(x.endsAt, locale)}. للاستمرار اشتركوا من الإعدادات ← الاشتراك؛ وإلا يعود المسجد إلى الباقة المجانية دون فقدان أي شيء.`
            : `The ${esc(x.plan)} trial for <b>${esc(x.mosqueName)}</b> ends on ${date(x.endsAt, locale)}. To keep going, subscribe from Settings → Subscription; otherwise the mosque returns to the free plan and nothing is lost.`,
        ],
        { label: ar ? 'الاشتراك الآن' : 'Subscribe now', url: `${x.adminUrl}settings` },
        FOOT[locale],
      );
    }
    case 'trialEnded': {
      const x = d as TemplateData['trialEnded'];
      return build(
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
    case 'test': {
      const x = d as TemplateData['test'];
      return build(locale, ar ? 'رسالة تجريبية من جُمعة' : 'Test email from Jumaah', ar ? 'إعدادات البريد تعمل.' : 'Your email settings work.', [ar ? `أرسلها ${esc(x.sentBy)} من لوحة المنصة.` : `Sent by ${esc(x.sentBy)} from the platform page.`], null, FOOT[locale]);
    }
  }
  throw new Error(`Unknown template ${String(name)}`);
}
