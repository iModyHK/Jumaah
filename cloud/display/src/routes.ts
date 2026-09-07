import { basePath } from '@jumaah/display';

export function archiveUrl(slug: string, khutbahId?: string): string {
  return `${basePath()}/a/${encodeURIComponent(slug)}${khutbahId ? `/${encodeURIComponent(khutbahId)}` : ''}`;
}
