/** Jumaah Cloud's additions to the display app: the public archive, printable invoices, and the archive link on phones. */
import type { DisplayExtensions, ExtRoute } from '@jumaah/display';
import ar from '@jumaah/cloud-shared/i18n/ar.json';
import en from '@jumaah/cloud-shared/i18n/en.json';
import './cloud.css';
import { Archive } from './screens/Archive';
import { InvoicePage } from './screens/Invoice';
import { MobileArchiveLink } from './MobileArchiveLink';

export const cloudDisplayExtensions: DisplayExtensions = {
  routes: [
    {
      // /display/a/<slug>[/<id>] -> the public archive of past khutbahs
      match: (parts) => (parts[0] === 'a' && parts[1] ? { name: 'archive', slug: parts[1], khutbahId: parts[2] ?? null } : null),
      render: (r: ExtRoute) => <Archive key={`${r.slug}-${r.khutbahId ?? ''}`} slug={r.slug as string} khutbahId={r.khutbahId as string | null} />,
    },
    {
      // /display/invoice/<number>?t=<token> -> a printable invoice
      match: (parts, q) => (parts[0] === 'invoice' && parts[1] ? { name: 'invoice', number: parts[1], token: q.get('t') ?? '', paid: q.get('paid') === '1' } : null),
      render: (r: ExtRoute) => <InvoicePage key={r.number as string} number={r.number as string} token={r.token as string} paid={!!r.paid} />,
    },
  ],
  mobileLinks: [MobileArchiveLink],
  i18n: { ar: ar as Record<string, unknown>, en: en as Record<string, unknown> },
};
