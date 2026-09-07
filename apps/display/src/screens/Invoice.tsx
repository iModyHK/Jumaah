import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSar, type PublicInvoiceDto } from '@jumaah/core';
import { apiBaseUrl, LangText } from '@jumaah/ui';
import { CenterMessage } from '../components/Overlays';
import { QrCode } from '../components/QrCode';
import { useTheme } from '../kiosk';

/**
 * Invoice page: /display/invoice/<number>?t=<token>. Anyone with the link can view and print it (the token is the
 * secret). Bilingual, with the ZATCA QR when the seller has a VAT number, a pay button when a gateway is configured
 * and the bank details otherwise.
 */
export function InvoicePage({ number, token, paid }: { number: string; token: string; paid: boolean }) {
  const { t, i18n } = useTranslation();
  useTheme('light');
  const [data, setData] = useState<PublicInvoiceDto | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBaseUrl()}/api/public/invoices/${encodeURIComponent(number)}?t=${encodeURIComponent(token)}`, { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? (r.json() as Promise<PublicInvoiceDto>) : null))
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [number, token]);
  useEffect(() => {
    document.documentElement.classList.add('j-print');
    return () => document.documentElement.classList.remove('j-print');
  }, []);

  if (data === undefined) return <CenterMessage spinner>{t('display.connecting')}</CenterMessage>;
  if (!data) return <CenterMessage>{t('errors.NOT_FOUND')}</CenterMessage>;
  const { invoice: inv, seller, qr } = data;
  const ar = i18n.language === 'ar';
  const L = (en: string, arText: string) => (ar ? arText : en);
  const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat(ar ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso)) : '—');
  const money = (h: number) => `${formatSar(h, ar ? 'ar' : 'en')} ${L('SAR', 'ر.س')}`;
  const status = inv.status === 'PAID' ? L('Paid', 'مدفوعة') : inv.status === 'VOID' ? L('Void', 'ملغاة') : L('Unpaid', 'غير مدفوعة');

  return (
    <div className="j-invoice" dir={ar ? 'rtl' : 'ltr'}>
      <div className="j-invoice-toolbar">
        <button type="button" className="j-archive-btn" onClick={() => window.print()}>
          {L('Print', 'طباعة')}
        </button>
        <button type="button" className="j-archive-btn j-archive-btn-ghost" onClick={() => void i18n.changeLanguage(ar ? 'en' : 'ar')}>
          {ar ? 'English' : 'العربية'}
        </button>
        {inv.status === 'OPEN' && inv.paymentUrl && (
          <a className="j-archive-btn" href={inv.paymentUrl}>
            {L('Pay now', 'ادفع الآن')}
          </a>
        )}
      </div>
      {paid && inv.status === 'PAID' && <div className="j-invoice-banner">{L('Thank you, the payment was received.', 'شكراً لكم، تم استلام الدفعة.')}</div>}
      <article className="j-invoice-page">
        <header className="j-invoice-head">
          <div>
            <div className="j-invoice-seller">{seller.name}</div>
            {seller.address && <div className="j-invoice-muted">{seller.address}</div>}
            {seller.vatNumber && (
              <div className="j-invoice-muted" dir="ltr">
                {L('VAT number', 'الرقم الضريبي')}: {seller.vatNumber}
              </div>
            )}
          </div>
          <div className="j-invoice-title">
            <h1>{seller.vatNumber ? L('Tax invoice', 'فاتورة ضريبية') : L('Invoice', 'فاتورة')}</h1>
            <div className="j-invoice-number" dir="ltr">
              {inv.number}
            </div>
            <div className={`j-invoice-status j-invoice-status-${inv.status.toLowerCase()}`}>{status}</div>
          </div>
        </header>
        <section className="j-invoice-meta">
          <div>
            <div className="j-invoice-label">{L('Billed to', 'الفاتورة إلى')}</div>
            <div>{inv.billTo.name}</div>
            {inv.billTo.address && <div className="j-invoice-muted">{inv.billTo.address}</div>}
            {inv.billTo.vatNumber && (
              <div className="j-invoice-muted" dir="ltr">
                {L('VAT number', 'الرقم الضريبي')}: {inv.billTo.vatNumber}
              </div>
            )}
            {inv.billTo.email && (
              <div className="j-invoice-muted" dir="ltr">
                {inv.billTo.email}
              </div>
            )}
          </div>
          <div>
            <div>
              <span className="j-invoice-label">{L('Issued', 'تاريخ الإصدار')}</span> {date(inv.issuedAt)}
            </div>
            <div>
              <span className="j-invoice-label">{L('Due', 'تاريخ الاستحقاق')}</span> {date(inv.dueAt)}
            </div>
            {inv.paidAt && (
              <div>
                <span className="j-invoice-label">{L('Paid', 'تاريخ الدفع')}</span> {date(inv.paidAt)}
              </div>
            )}
          </div>
          {qr && (
            <div className="j-invoice-qr">
              <QrCode value={qr} className="j-invoice-qr-img" />
            </div>
          )}
        </section>
        <table className="j-invoice-table">
          <thead>
            <tr>
              <th>{L('Description', 'البيان')}</th>
              <th className="num">{L('Qty', 'الكمية')}</th>
              <th className="num">{L('Unit price', 'سعر الوحدة')}</th>
              <th className="num">{L('Amount', 'المبلغ')}</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <LangText lang={ar ? 'ar' : 'en'} as="div">
                    {ar ? l.descriptionAr : l.description}
                  </LangText>
                </td>
                <td className="num">{l.quantity}</td>
                <td className="num">{money(l.unitPrice)}</td>
                <td className="num">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>{L('Subtotal', 'المجموع قبل الضريبة')}</td>
              <td className="num">{money(inv.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={3}>
                {L('VAT', 'ضريبة القيمة المضافة')} ({Math.round(inv.vatRate * 100)}%)
              </td>
              <td className="num">{money(inv.vat)}</td>
            </tr>
            <tr className="j-invoice-total">
              <td colSpan={3}>{L('Total', 'الإجمالي')}</td>
              <td className="num">{money(inv.total)}</td>
            </tr>
          </tfoot>
        </table>
        {inv.status === 'OPEN' && (
          <section className="j-invoice-pay">
            <div className="j-invoice-label">{L('How to pay', 'طريقة الدفع')}</div>
            {inv.paymentUrl ? (
              <p>
                {L('Pay online by mada, Apple Pay or card:', 'ادفعوا إلكترونياً عبر مدى أو Apple Pay أو البطاقة:')}{' '}
                <a href={inv.paymentUrl} dir="ltr">
                  {inv.paymentUrl}
                </a>
              </p>
            ) : (
              <p>{L('By bank transfer, quoting the invoice number:', 'بالتحويل البنكي مع ذكر رقم الفاتورة:')}</p>
            )}
            {seller.iban && (
              <div className="j-invoice-bank" dir="ltr">
                <div>
                  <b>{L('Bank', 'البنك')}:</b> {seller.bank ?? '—'}
                </div>
                <div>
                  <b>IBAN:</b> {seller.iban}
                </div>
                <div>
                  <b>{L('Beneficiary', 'المستفيد')}:</b> {seller.name}
                </div>
              </div>
            )}
          </section>
        )}
        {inv.note && <p className="j-invoice-muted">{inv.note}</p>}
        <footer className="j-invoice-foot">
          {seller.name} · {inv.number}
          {seller.vatNumber ? '' : ` · ${L('No VAT charged: seller not yet VAT-registered.', 'لم تُحتسب ضريبة قيمة مضافة: المورد غير مسجل ضريبياً بعد.')}`}
        </footer>
      </article>
    </div>
  );
}
