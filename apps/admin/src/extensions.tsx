/**
 * Extension points of the admin app. The Community Edition renders with EMPTY_EXTENSIONS; Jumaah Cloud passes its
 * pages, cards, navigation entries and strings through <AdminApp extensions={…}>.
 */
import { createContext, useContext, type ComponentType, type ReactNode } from 'react';
import type { AuthUser, CostEstimate, Role, TenantDto } from '@jumaah/core';

export interface AdminNavItem {
  to: string;
  /** i18n key of the label. */
  key: string;
  icon: string;
  admin?: boolean;
  superOnly?: boolean;
  needsTenant?: boolean;
  /** Heading this item sits under in the sidebar; items without one come first, in the mosque's own group. */
  group?: string;
  /** Extra visibility rule (e.g. organisation admins only). */
  visible?: (user: AuthUser | null) => boolean;
}

export interface AdminRoute {
  path: string;
  element: ReactNode;
  roles?: readonly Role[];
  needsTenant?: boolean;
  /** Rendered without the shell (full-page views such as printable handouts). */
  standalone?: boolean;
}

export interface TranslateGate {
  /** Why the platform providers may not be used, or null. */
  message: string | null;
  /** The job cannot start at all. */
  blocked: boolean;
  /** A short note under the message (remaining allowance). */
  note: string | null;
}

export interface AdminExtensions {
  routes: AdminRoute[];
  nav: AdminNavItem[];
  /**
   * Replaces the whole server-wide page (the hosted edition puts its operator console there). When it is not set,
   * the built-in page shows the counts and `platformCards` below them.
   */
  platformPage?: ComponentType;
  /** Rendered above the dashboard cards. */
  dashboardTop: ComponentType[];
  /** Rendered below the dashboard cards. */
  dashboardBottom: ComponentType[];
  /** Cards appended to the Settings page (id = section anchor, key = i18n key of the section). */
  settingsCards: Array<{ id: string; key: string; Component: ComponentType<{ tenant: TenantDto }> }>;
  /** Cards appended to the platform page. */
  platformCards: ComponentType[];
  /** Rendered above the provider list. */
  providersTop: ComponentType[];
  /** Extra buttons in the khutbah editor toolbar. */
  editorActions: ComponentType<{ khutbahId: string }>[];
  /** Mosques page: an extra table cell, extra row actions, extra create-form fields. */
  tenants: {
    cell?: { header: string; Component: ComponentType<{ tenant: TenantDto }> };
    actions?: ComponentType<{ tenant: TenantDto; onChanged: () => void }>;
    createFields?: ComponentType<{ value: Record<string, unknown>; onChange: (patch: Record<string, unknown>) => void; errors: Record<string, string> }>;
  };
  /** Replaces the mosque name in the top bar for users who may switch mosques (organisation admins). */
  topBarSwitcher?: ComponentType;
  /** Gate shown in the translate dialog (plans). */
  translateGate?: (estimate: CostEstimate | null | undefined, languages: string[], t: (key: string, opts?: Record<string, unknown>) => string) => TranslateGate;
  /** Label next to a locked feature (why it is locked); null hides the field. */
  lockedFeatureLabel?: (feature: string, featuresExt: Record<string, unknown> | undefined, t: (key: string, opts?: Record<string, unknown>) => string) => string | null;
  /** Extra i18n resources merged into the core ones. */
  i18n?: { ar: Record<string, unknown>; en: Record<string, unknown> };
}

export const EMPTY_EXTENSIONS: AdminExtensions = { routes: [], nav: [], dashboardTop: [], dashboardBottom: [], settingsCards: [], platformCards: [], providersTop: [], editorActions: [], tenants: {} };

const ExtensionsContext = createContext<AdminExtensions>(EMPTY_EXTENSIONS);
export const ExtensionsProvider = ExtensionsContext.Provider;
export function useExtensions(): AdminExtensions {
  return useContext(ExtensionsContext);
}
