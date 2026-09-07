import type { AuthUser, TenantDto } from '@jumaah/core';
import type { CloudTenantExt } from '@jumaah/cloud-shared';

/** The hosted edition's fields of a mosque (plan, subscription, organisation, custom domain) travel in TenantDto.ext. */
export function cloudTenant(t: TenantDto): CloudTenantExt {
  return (t.ext ?? {}) as unknown as CloudTenantExt;
}

/** The organisation a signed-in user administers, if any. */
export function orgOf(user: AuthUser | null | undefined): string | null {
  return (user?.ext?.organisationId as string | null | undefined) ?? null;
}
