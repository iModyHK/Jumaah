/**
 * Transactional email templates of the core, Arabic and English. Each template returns a subject, a plain-text body
 * and an HTML body built on one small layout. Extensions add their own templates through the `emailTemplates` hook
 * and reuse the layout helpers exported here.
 */
export type Locale = 'ar' | 'en';

export interface Rendered {
  subject: string;
  text: string;
  html: string;
}

export interface TemplateData {
  passwordReset: { name: string; resetUrl: string; mosqueName: string | null; expiresMinutes: number };
  test: { sentBy: string };
}

export type TemplateName = keyof TemplateData;

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function dateLabel(iso: string | null, locale: Locale): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

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

export function buildEmail(locale: Locale, subject: string, title: string, paragraphs: string[], button: { label: string; url: string } | null, footer: string): Rendered {
  const text = [title, '', ...paragraphs.map((p) => p.replace(/<[^>]+>/g, '')), ...(button ? ['', `${button.label}: ${button.url}`] : []), '', footer].join('\n');
  return { subject, text, html: layout(locale, title, paragraphs, button, footer) };
}

export const FOOT: Record<Locale, string> = { ar: 'جُمعة · ترجمة خطبة الجمعة مباشرةً على شاشات المسجد', en: 'Jumaah · live Friday khutbah translation for mosques' };

type ExtraTemplates = Record<string, (locale: Locale, data: Record<string, unknown>) => Rendered>;

export function renderTemplate(name: string, locale: Locale, d: unknown, extra?: ExtraTemplates): Rendered {
  const ar = locale === 'ar';
  switch (name) {
    case 'passwordReset': {
      const x = d as TemplateData['passwordReset'];
      return buildEmail(
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
    case 'test': {
      const x = d as TemplateData['test'];
      return buildEmail(locale, ar ? 'رسالة تجريبية من جُمعة' : 'Test email from Jumaah', ar ? 'إعدادات البريد تعمل.' : 'Your email settings work.', [ar ? `أرسلها ${esc(x.sentBy)} من لوحة المنصة.` : `Sent by ${esc(x.sentBy)} from the platform page.`], null, FOOT[locale]);
    }
  }
  const fromExtension = extra?.[name];
  if (fromExtension) return fromExtension(locale, (d ?? {}) as Record<string, unknown>);
  throw new Error(`Unknown template ${name}`);
}
