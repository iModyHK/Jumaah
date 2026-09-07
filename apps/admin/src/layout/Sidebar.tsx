import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { useExtensions, type AdminNavItem } from '../extensions';

const ITEMS: AdminNavItem[] = [
  { to: '/', key: 'nav.dashboard', icon: '▦', needsTenant: true },
  { to: '/khutbahs', key: 'nav.khutbahs', icon: '☰', needsTenant: true },
  { to: '/library', key: 'nav.library', icon: '▤' },
  { to: '/displays', key: 'nav.displays', icon: '▭', needsTenant: true },
  { to: '/glossary', key: 'nav.glossary', icon: '✎', needsTenant: true },
  { to: '/providers', key: 'nav.providers', icon: '⇄', admin: true, needsTenant: true },
  { to: '/users', key: 'nav.users', icon: '👤', admin: true, needsTenant: true },
  { to: '/settings', key: 'nav.settings', icon: '⚙', admin: true, needsTenant: true },
  { to: '/audit', key: 'nav.audit', icon: '≡', admin: true },
  { to: '/backups', key: 'nav.backups', icon: '⬇', admin: true, needsTenant: true },
  { to: '/sync', key: 'nav.sync', icon: '☁', admin: true, needsTenant: true },
];
const TAIL: AdminNavItem[] = [
  { to: '/tenants', key: 'nav.tenants', icon: '🕌', superOnly: true, group: 'nav.groups.platform' },
  { to: '/platform', key: 'tenants.platform', icon: '◎', superOnly: true, group: 'nav.groups.platform' },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { isAdmin, isSuper, tenantId, user } = useAuth();
  const ext = useExtensions();
  const visible = [...ITEMS, ...ext.nav, ...TAIL].filter((i) => (!i.admin || isAdmin) && (!i.superOnly || isSuper) && (!i.visible || i.visible(user)) && (!i.needsTenant || tenantId || !isSuper));
  // Items keep their order; each heading appears once, before the first item that names it.
  const groups: Array<{ key: string | undefined; items: AdminNavItem[] }> = [];
  for (const i of visible) {
    const last = groups[groups.length - 1];
    if (last && last.key === i.group) last.items.push(i);
    else groups.push({ key: i.group, items: [i] });
  }
  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      <div className="mb-3 flex items-center gap-2 px-2 py-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-lg font-bold" style={{ background: 'var(--j-accent-soft)', color: 'var(--j-accent)' }}>
          ج
        </span>
        <div>
          <div className="font-bold leading-tight">{t('app.name')}</div>
          <div className="j-muted text-[0.65rem]">{t('app.tagline')}</div>
        </div>
      </div>
      {groups.map((g, gi) => (
        <div key={gi} className={g.key ? 'mt-4' : undefined}>
          {g.key && <div className="j-muted px-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider">{t(g.key)}</div>}
          {g.items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === '/'} className="j-nav-link" onClick={onNavigate}>
              <span className="w-5 text-center text-sm opacity-70">{i.icon}</span>
              <span>{t(i.key)}</span>
            </NavLink>
          ))}
        </div>
      ))}
      <div className="mt-auto border-t pt-3" style={{ borderColor: 'var(--j-border)' }}>
        <a href="/imam/" target="_blank" rel="noreferrer" className="j-nav-link">
          <span className="w-5 text-center text-sm opacity-70">▶</span>
          <span>{t('nav.imamView')}</span>
        </a>
      </div>
    </nav>
  );
}
