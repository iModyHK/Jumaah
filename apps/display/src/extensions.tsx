/**
 * Extension points of the display app (screens, phones, poster). Jumaah Cloud adds routes such as the public
 * archive and invoice pages, and links on the phone page.
 */
import { createContext, useContext, type ComponentType, type ReactNode } from 'react';
import type { TenantPublicInfo } from '@jumaah/core';

export interface ExtRoute {
  name: string;
  [param: string]: unknown;
}

export interface DisplayExtensions {
  /** Extra routes: each matcher looks at the path segments after /display/ and returns a route or null. */
  routes: Array<{ match: (parts: string[], search: URLSearchParams) => ExtRoute | null; render: (route: ExtRoute) => ReactNode }>;
  /** Rendered in the header of the phone page (e.g. a link to the mosque's archive). */
  mobileLinks: ComponentType<{ tenant: TenantPublicInfo; slug: string }>[];
  /** Extra i18n resources merged into the core ones. */
  i18n?: { ar: Record<string, unknown>; en: Record<string, unknown> };
}

export const EMPTY_EXTENSIONS: DisplayExtensions = { routes: [], mobileLinks: [] };

const ExtensionsContext = createContext<DisplayExtensions>(EMPTY_EXTENSIONS);
export const ExtensionsProvider = ExtensionsContext.Provider;
export function useExtensions(): DisplayExtensions {
  return useContext(ExtensionsContext);
}
