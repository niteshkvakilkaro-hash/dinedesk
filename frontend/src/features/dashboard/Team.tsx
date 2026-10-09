import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, UserX, UserCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatDateTime, formatPhone, isIndianMobile } from '@/lib/format';
import { useSession } from '@/hooks/useSession';
import { Alert, Badge, Dialog, EmptyState, ErrorState, Field, SkeletonRows, Spinner, toast } from '@/components/ui';
import type { Role, StaffMember } from '@/types';

interface StaffMeta {
  staff_count: number;
  staff_limit: number | null;
  roles: Role[];
}

function AddMember({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [method, setMethod] = useState<'mobile' | 'email'>('mobile');
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', role: roles[0] ?? 'waiter' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/tenant/staff', {
        name: form.name,
        role: form.role,
        ...(method === 'mobile' ? { phone: form.phone } : { email: form.email, password: form.password }),
      }),
    onSuccess: (res) => {
      toast.success(res.message ?? '');
      void qc.invalidateQueries({ queryKey: ['staff'] });
      onClose();
    },
    onError: (e: ApiError) => {
      if (e.errors) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
      setError(e.message);
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = t('auth.validation.name');
    if (method === 'mobile' && !isIndianMobile(form.phone)) errs.phone = t('auth.validation.mobile');
    if (method === 'email' && !/^\S+@\S+\.\S+$/.test(form.email)) errs.email = t('auth.validation.email');
    if (method === 'email' && !(form.password.length >= 8 && /[A-Za-z]/.test(form.password) && /\d/.test(form.password))) errs.password = t('auth.validation.password');
    setErrors(errs);
    setError('');
    if (!Object.keys(errs).length) mutation.mutate();
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert>{error}</Alert>}
      <Field label={t('auth.name')} error={errors.name}>
        {(a) => <input {...a} className="field-input" value={form.name} onChange={set('name')} data-autofocus />}
      </Field>
      <Field label={t('dashboard.team.role')} hint={t(`roleHints.${form.role}`)} error={errors.role}>
        {(a) => (
          <select {...a} className="field-input" value={form.role} onChange={set('role')}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <fieldset>
        <legend className="field-label">{t('dashboard.team.signInWith')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['mobile', 'email'] as const).map((m) => (
            <label key={m} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold ${method === m ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
              <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="sr-only" />
              {m === 'mobile' ? t('dashboard.team.byMobile') : t('dashboard.team.byEmail')}
            </label>
          ))}
        </div>
      </fieldset>
      {method === 'mobile' ? (
        <Field label={t('auth.mobile')} error={errors.phone}>
          {(a) => <input {...a} type="tel" inputMode="tel" className="field-input" placeholder="98290 12345" value={form.phone} onChange={set('phone')} />}
        </Field>
      ) : (
        <>
          <Field label={t('auth.email')} error={errors.email}>
            {(a) => <input {...a} type="email" className="field-input" autoComplete="off" value={form.email} onChange={set('email')} />}
          </Field>
          <Field label={t('auth.password')} hint={t('auth.passwordHint')} error={errors.password}>
            {(a) => <input {...a} type="password" className="field-input" autoComplete="new-password" value={form.password} onChange={set('password')} />}
          </Field>
        </>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-outline" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner /> : t('common.add')}
        </button>
      </div>
    </form>
  );
}

export default function Team() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<StaffMember | null>(null);

  const query = useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const res = await api.get<StaffMember[]>('/tenant/staff');
      return { staff: res.data, meta: res.meta as unknown as StaffMeta };
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: number; role?: Role; status?: string }) => api.patch(`/tenant/staff/${id}`, body),
    onSuccess: (res) => {
      toast.success(res.message ?? '');
      void qc.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/tenant/staff/${id}`),
    onSuccess: (res) => {
      toast.success(res.message ?? '');
      setRemoving(null);
      void qc.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const meta = query.data?.meta;
  const atLimit = meta && meta.staff_limit !== null && meta.staff_count >= meta.staff_limit;
  const others = (query.data?.staff ?? []).filter((m) => m.role !== 'owner');

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t('dashboard.team.title')}</h1>
          <p className="text-muted">{t('dashboard.team.subtitle')}</p>
          {meta && (
            <p className="mt-1 text-sm font-semibold">
              {meta.staff_limit === null ? t('dashboard.team.usageUnlimited', { count: meta.staff_count }) : t('dashboard.team.usage', { count: meta.staff_count, limit: meta.staff_limit })}
            </p>
          )}
        </div>
        <button type="button" className="btn-primary" onClick={() => setAdding(true)} disabled={!meta || Boolean(atLimit)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> {t('dashboard.team.add')}
        </button>
      </div>
      {atLimit && (
        <div className="mb-4">
          <Alert tone="warn">{t('dashboard.team.limitReached')}</Alert>
        </div>
      )}

      <div className="card overflow-hidden">
        {query.isLoading ? (
          <SkeletonRows />
        ) : query.isError ? (
          <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />
        ) : (
          <ul className="divide-y divide-line">
            {query.data!.staff.map((m) => {
              const isOwner = m.role === 'owner';
              const isMe = m.id === session?.user.id;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper font-bold">{m.name[0]}</span>
                  <div className="min-w-[160px] flex-1">
                    <p className="font-semibold">
                      {m.name} {isMe && <span className="font-normal text-muted">({t('dashboard.team.you')})</span>}
                    </p>
                    <p className="text-sm text-muted">
                      {m.email ?? formatPhone(m.phone)} · {t('dashboard.team.lastSeen')}: {m.last_login_at ? formatDateTime(m.last_login_at) : t('dashboard.team.never')}
                    </p>
                  </div>
                  {isOwner ? (
                    <Badge tone="neutral">{t('roles.owner')}</Badge>
                  ) : (
                    <>
                      <label className="sr-only" htmlFor={`role-${m.id}`}>
                        {t('dashboard.team.role')}
                      </label>
                      <select id={`role-${m.id}`} className="field-input !w-auto !py-2 text-sm" value={m.role} onChange={(e) => update.mutate({ id: m.id, role: e.target.value as Role })}>
                        {meta?.roles.map((r) => (
                          <option key={r} value={r}>
                            {t(`roles.${r}`)}
                          </option>
                        ))}
                      </select>
                      <Badge tone={m.status}>{t(`dashboard.team.${m.status}`)}</Badge>
                      <button
                        type="button"
                        className="btn-ghost !min-h-10 !px-3 text-sm"
                        onClick={() => update.mutate({ id: m.id, status: m.status === 'active' ? 'disabled' : 'active' })}
                      >
                        {m.status === 'active' ? <UserX className="h-4 w-4" aria-hidden="true" /> : <UserCheck className="h-4 w-4" aria-hidden="true" />}
                        {m.status === 'active' ? t('dashboard.team.disable') : t('dashboard.team.enable')}
                      </button>
                      <button type="button" className="rounded-full p-2 text-muted hover:bg-danger-soft hover:text-danger" aria-label={`${t('dashboard.team.remove')} ${m.name}`} onClick={() => setRemoving(m)}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {query.isSuccess && others.length === 0 && <EmptyState title={t('dashboard.team.empty')}>{t('dashboard.team.emptyHint')}</EmptyState>}
      </div>

      <Dialog open={adding} onClose={() => setAdding(false)} title={t('dashboard.team.add')}>
        {meta && <AddMember roles={meta.roles} onClose={() => setAdding(false)} />}
      </Dialog>
      <Dialog open={Boolean(removing)} onClose={() => setRemoving(null)} title={t('dashboard.team.remove')}>
        <p>{t('dashboard.team.removeConfirm', { name: removing?.name })}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={() => setRemoving(null)} data-autofocus>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn bg-danger text-white hover:bg-danger/90" disabled={remove.isPending} onClick={() => removing && remove.mutate(removing.id)}>
            {remove.isPending ? <Spinner /> : t('dashboard.team.remove')}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
