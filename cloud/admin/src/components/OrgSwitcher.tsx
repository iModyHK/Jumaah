import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { OrganisationDto } from '@jumaah/cloud-shared';
import { api, useAuth } from '@jumaah/admin';
import { orgOf } from '../cloud-tenant';

/** Organisation admins switch between the mosques of their organisation from the top bar. */
export function OrgSwitcher() {
  const { user, tenantId, setTenantId } = useAuth();
  const navigate = useNavigate();
  const oid = orgOf(user);
  const organisation = useQuery({ queryKey: ['organisation', oid], queryFn: () => api.get<OrganisationDto>('/organisation'), enabled: !!oid, staleTime: 60_000 });
  const orgTenants = organisation.data?.tenants ?? [];
  if (!oid || orgTenants.length === 0) return <div className="truncate font-semibold">{orgTenants.find((x) => x.id === tenantId)?.name ?? user?.tenantName ?? null}</div>;
  return (
    <div className="flex items-center gap-2">
      <span className="j-muted hidden text-xs sm:inline">{organisation.data?.name}</span>
      <select
        className="j-input w-56 py-1 text-sm"
        value={tenantId ?? ''}
        onChange={(e) => {
          setTenantId(e.target.value || null);
          navigate('/');
        }}
      >
        {orgTenants.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    </div>
  );
}
