import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inviteUserSchema, updateUserSchema, type Paginated, type Role, type UserDto } from '@jumaah/shared';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CopyField } from '../components/CopyButton';
import { DataTable } from '../components/DataTable';
import { Checkbox, Field, Select, TextInput } from '../components/Field';
import { Modal } from '../components/Modal';
import { Card, PageHeader } from '../components/PageHeader';
import { BoolBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { fmtDateTime } from '../lib/format';
import { clean, validate } from '../lib/forms';

const INVITE_ROLES: Role[] = ['MOSQUE_ADMIN', 'TRANSLATOR', 'IMAM'];

interface Invitation {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  expiresAt: string;
  createdAt: string;
}

interface InviteResult {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  inviteUrl: string;
}

export function UsersPage() {
  const { t } = useTranslation();
  const { tenantId, user: me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserDto | null>(null);

  const users = useQuery({ queryKey: ['users', tenantId], queryFn: () => api.get<Paginated<UserDto>>('/users', { pageSize: 200 }) });
  const invitations = useQuery({ queryKey: ['users', 'invitations', tenantId], queryFn: () => api.get<Invitation[]>('/users/invitations') });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/users/invitations/${id}`),
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(e),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      toast.success(t('common.success'));
      void invalidate();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <div>
      <PageHeader
        title={t('users.title')}
        actions={
          <Button variant="primary" onClick={() => setInviteOpen(true)}>
            {t('users.invite')}
          </Button>
        }
      />
      <DataTable<UserDto>
        loading={users.isLoading}
        rows={users.data?.items ?? []}
        rowKey={(u) => u.id}
        columns={[
          { key: 'name', header: t('common.name'), render: (u) => <span className="font-semibold">{u.name}</span> },
          { key: 'email', header: t('common.email'), render: (u) => <span dir="ltr">{u.email}</span> },
          { key: 'role', header: t('common.role'), render: (u) => t(`roles.${u.role}`) },
          { key: 'active', header: t('common.status'), render: (u) => <BoolBadge value={u.isActive} yes={t('users.active')} no={t('users.inactive')} /> },
          { key: 'last', header: t('users.lastLogin'), render: (u) => <span className="text-xs">{fmtDateTime(u.lastLoginAt)}</span> },
          {
            key: 'actions',
            header: t('common.actions'),
            className: 'text-end',
            render: (u) => (
              <div className="flex justify-end gap-1">
                <Button className="px-2 py-1 text-xs" onClick={() => setEditing(u)} disabled={u.role === 'SUPER_ADMIN'}>
                  {t('common.edit')}
                </Button>
                <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => setDeleteTarget(u)} disabled={u.id === me?.id}>
                  {t('common.delete')}
                </Button>
              </div>
            ),
          },
        ]}
      />

      <Card title={t('users.pendingInvites')} className="mt-6">
        {invitations.isLoading && <Spinner />}
        {invitations.data && invitations.data.length === 0 && <div className="j-muted text-sm">{t('common.none')}</div>}
        {invitations.data && invitations.data.length > 0 && (
          <table className="j-table">
            <thead>
              <tr>
                <th>{t('common.email')}</th>
                <th>{t('common.role')}</th>
                <th>{t('users.expiresAt')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invitations.data.map((i) => (
                <tr key={i.id}>
                  <td dir="ltr">{i.email}</td>
                  <td>{t(`roles.${i.role}`)}</td>
                  <td className="text-xs">{fmtDateTime(i.expiresAt)}</td>
                  <td className="text-end">
                    <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => revoke.mutate(i.id)}>
                      {t('users.revoke')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={(r) => {
          setInviteOpen(false);
          setInviteResult(r);
          void invalidate();
        }}
      />
      <Modal open={!!inviteResult} onClose={() => setInviteResult(null)} title={t('users.inviteSent')} footer={<Button onClick={() => setInviteResult(null)}>{t('common.close')}</Button>}>
        {inviteResult && (
          <div className="flex flex-col gap-2">
            <div className="text-sm">
              <span dir="ltr">{inviteResult.email}</span> — {t(`roles.${inviteResult.role}`)}
            </div>
            <div className="j-label">{t('users.inviteLink')}</div>
            <CopyField value={inviteResult.inviteUrl} />
            <div className="j-muted text-xs">{t('users.inviteLinkHint')}</div>
          </div>
        )}
      </Modal>
      <EditUserModal user={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} danger message={t('users.deleteConfirm', { name: deleteTarget?.name ?? '' })} onConfirm={() => (deleteTarget ? del.mutateAsync(deleteTarget.id).then(() => undefined) : undefined)} />
    </div>
  );
}

function InviteModal({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: (r: InviteResult) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('TRANSLATOR');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const invite = useMutation({
    mutationFn: (body: unknown) => api.post<InviteResult>('/users/invite', body),
    onSuccess: (r) => {
      setEmail('');
      setName('');
      onInvited(r);
    },
    onError: (e) => toast.error(e),
  });
  const submit = () => {
    const v = validate(inviteUserSchema, clean({ email: email.trim().toLowerCase(), role, name: name.trim() }));
    setErrors(v.errors);
    if (v.ok) invite.mutate(v.data);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('users.invite')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit} disabled={invite.isPending}>
            {invite.isPending ? <Spinner /> : t('users.invite')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('common.email')} error={errors.email}>
          <TextInput type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('common.role')} error={errors.role}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {INVITE_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.name')} error={errors.name} hint={t('common.optional')}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function EditUserModal({ user, onClose }: { user: UserDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('TRANSLATOR');
  const [isActive, setActive] = useState(true);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [key, setKey] = useState<string | null>(null);
  if (user && key !== user.id) {
    setKey(user.id);
    setName(user.name);
    setRole(user.role);
    setActive(user.isActive);
    setPassword('');
    setErrors({});
  }
  const save = useMutation({
    mutationFn: (body: unknown) => api.patch<UserDto>(`/users/${user!.id}`, body),
    onSuccess: () => {
      toast.success(t('common.success'));
      void qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  const submit = () => {
    const v = validate(updateUserSchema, clean({ name: name.trim(), role, isActive, password }));
    setErrors(v.errors);
    if (v.ok) save.mutate(v.data);
  };
  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={t('common.edit')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? <Spinner /> : t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('common.name')} error={errors.name}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('common.role')} error={errors.role}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {INVITE_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Checkbox label={t('users.active')} checked={isActive} onChange={setActive} disabled={user?.id === me?.id} />
        <Field label={t('users.resetPassword')} error={errors.password}>
          <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
      </div>
    </Modal>
  );
}
