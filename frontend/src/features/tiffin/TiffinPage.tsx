import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, CookingPot, MessageCircle, Pause, Pencil, Phone, Play, Plus, RefreshCw, Share2, Undo2, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useCan } from '@/hooks/useSession';
import { Badge, Dialog, EmptyState, ErrorState, Field, SkeletonRows, Spinner, toast, Toggle } from '@/components/ui';

type Slot = 'lunch' | 'dinner' | 'both';
interface Plan { id: number; name: string; description: string | null; diet: 'veg' | 'non_veg' | null; slot: Slot; meals: number; days_valid: number; price: string; is_active: boolean; sort: number }
interface Sub {
  id: number; code: string; status: 'requested' | 'active' | 'paused' | 'completed' | 'cancelled';
  plan: { id: number; name: string; diet: string | null; price: string } | null;
  name: string; phone: string; address: string; slot: Slot; starts_on: string; ends_on: string | null; paused_on: string | null;
  meals_total: number; meals_used: number; remaining: number; amount_paid: string; notes: string | null; source: 'website' | 'staff'; created_at: string;
}
interface Day { date: string; slot: 'lunch' | 'dinner'; list: (Sub & { mark: 'delivered' | 'skipped' | 'paused' | null })[]; counts: { total: number; delivered: number; skipped: number } }

const TONE: Record<Sub['status'], string> = { requested: 'pending', active: 'confirmed', paused: 'preparing', completed: 'completed', cancelled: 'cancelled' };
const MODES = ['cash', 'upi', 'card', 'bank'] as const;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const shortDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const waTo = (phone: string, text = '') => `https://wa.me/${phone.replace(/\D+/g, '').replace(/^(\d{10})$/, '91$1')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
const fieldErrors = (e: ApiError) => (e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])) : { _: e.message });

function usePlans() {
  return useQuery({ queryKey: ['tiffin', 'plans'], queryFn: async () => (await api.get<Plan[]>('/tenant/tiffin/plans')).data });
}

// ——— Today ———

function TodayTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [date, setDate] = useState(today());
  const [slot, setSlot] = useState<'lunch' | 'dinner'>(() => (new Date().getHours() >= 16 ? 'dinner' : 'lunch'));
  const q = useQuery({ queryKey: ['tiffin', 'day', date, slot], queryFn: async () => (await api.get<Day>(`/tenant/tiffin/day?date=${date}&slot=${slot}`)).data });
  const mark = useMutation<unknown, ApiError, { id: number; status: 'delivered' | 'skipped' | null }>({
    mutationFn: ({ id, status }) => api.post(`/tenant/tiffin/subscriptions/${id}/mark`, { date, slot, status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tiffin'] }),
    onError: (e) => toast.error(e.message),
  });
  const d = q.data;
  const pending = d?.list.filter((s) => !s.mark) ?? [];
  const sheet = () => `${t(`tiffin.slot.${slot}`)} · ${shortDate(date)}\n\n${pending.map((s, i) => `${i + 1}. ${s.name} (${s.phone})\n${s.address}${s.notes ? `\nNote: ${s.notes}` : ''}`).join('\n\n')}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="date" className="field-input !w-auto" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label={t('tiffin.date')} />
        <div className="flex gap-1 rounded-full bg-ink/5 p-1" role="radiogroup" aria-label={t('tiffin.meal')}>
          {(['lunch', 'dinner'] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={slot === s} onClick={() => setSlot(s)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${slot === s ? 'bg-surface shadow' : 'text-muted'}`}>{t(`tiffin.slot.${s}`)}</button>
          ))}
        </div>
        {d && <p className="text-sm text-muted">{t('tiffin.counts', { delivered: d.counts.delivered, total: d.counts.total, skipped: d.counts.skipped })}</p>}
        {pending.length > 0 && <a href={`https://wa.me/?text=${encodeURIComponent(sheet())}`} target="_blank" rel="noreferrer" className="btn-ghost !min-h-10 ml-auto border border-line text-sm"><Share2 className="h-4 w-4" aria-hidden="true" /> {t('tiffin.shareList')}</a>}
      </div>
      {q.isLoading ? <SkeletonRows rows={4} /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} /> : !d!.list.length ? (
        <EmptyState title={t('tiffin.noneToday')}>{t('tiffin.noneTodayText')}</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {d!.list.map((s) => (
            <li key={s.id} className={`card p-4 ${s.mark === 'delivered' ? 'opacity-70' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">{s.name} <span className="text-xs font-semibold text-muted">{s.code}</span></p>
                  <p className="text-sm">{s.address}</p>
                  <p className="text-xs text-muted">{s.plan?.name} · {t('tiffin.left', { count: s.remaining })}{s.notes && <> · {s.notes}</>}</p>
                </div>
                <a href={`tel:${s.phone}`} className="btn-ghost !min-h-9 !px-2" aria-label={t('tiffin.call', { name: s.name })}><Phone className="h-4 w-4" aria-hidden="true" /></a>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {s.mark === 'paused' ? <Badge tone="preparing">{t('tiffin.status.paused')}</Badge> : s.mark ? (
                  <>
                    <Badge tone={s.mark === 'delivered' ? 'completed' : 'cancelled'}>{t(`tiffin.mark.${s.mark}`)}</Badge>
                    <button type="button" className="btn-ghost !min-h-9 text-sm" onClick={() => mark.mutate({ id: s.id, status: null })} disabled={mark.isPending}><Undo2 className="h-4 w-4" aria-hidden="true" /> {t('tiffin.undo')}</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn-primary !min-h-9 text-sm" onClick={() => mark.mutate({ id: s.id, status: 'delivered' })} disabled={mark.isPending || s.remaining < 1}><Check className="h-4 w-4" aria-hidden="true" /> {t('tiffin.delivered')}</button>
                    <button type="button" className="btn-ghost !min-h-9 text-sm" onClick={() => mark.mutate({ id: s.id, status: 'skipped' })} disabled={mark.isPending}>{t('tiffin.skip')}</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted">{t('tiffin.todayHint')}</p>
    </div>
  );
}

// ——— Subscribers ———

function PaymentDialog({ target, onClose }: { target: { sub: Sub; kind: 'activate' | 'renew' } | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({ amount: '', mode: 'upi', starts_on: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (target) setForm({ amount: target.sub.plan ? String(Number(target.sub.plan.price)) : '', mode: 'upi', starts_on: target.sub.starts_on < today() ? today() : target.sub.starts_on });
    setErrors({});
  }, [target]);
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => api.post(`/tenant/tiffin/subscriptions/${target!.sub.id}/${target!.kind}`, { amount: Number(form.amount || 0), mode: form.mode, ...(target!.kind === 'activate' ? { starts_on: form.starts_on } : {}) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tiffin'] });
      toast.success(target!.kind === 'activate' ? t('tiffin.started') : t('tiffin.renewed'));
      onClose();
    },
    onError: (e) => setErrors(fieldErrors(e)),
  });
  if (!target) return null;
  return (
    <Dialog open onClose={onClose} title={t(target.kind === 'activate' ? 'tiffin.confirmTitle' : 'tiffin.renewTitle', { name: target.sub.name })}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate>
        <p className="text-sm text-muted">{target.sub.plan?.name} · {t(target.kind === 'activate' ? 'tiffin.confirmHint' : 'tiffin.renewHint')}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('tiffin.amount')} error={errors.amount}>{(a) => <input {...a} type="number" min={0} step="1" className="field-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />}</Field>
          <Field label={t('tiffin.mode')} error={errors.mode}>{(a) => <select {...a} className="field-input" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>{MODES.map((m) => <option key={m} value={m}>{t(`tiffin.modes.${m}`)}</option>)}</select>}</Field>
          {target.kind === 'activate' && <Field label={t('tiffin.startsOn')} error={errors.starts_on}>{(a) => <input {...a} type="date" className="field-input" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} />}</Field>}
        </div>
        {errors._ && <p className="text-sm font-semibold text-danger" role="alert">{errors._}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t(target.kind === 'activate' ? 'tiffin.confirm' : 'tiffin.renew')}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** New subscriber at the counter (paid now), or edit one's details. */
function SubscriberDialog({ sub, onClose }: { sub: Sub | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const plans = usePlans();
  const s = sub === 'new' ? null : sub;
  const [form, setForm] = useState({ meal_plan_id: '', name: '', phone: '', address: '', slot: '', starts_on: today(), notes: '', amount: '', mode: 'upi' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (sub) setForm({ meal_plan_id: s?.plan ? String(s.plan.id) : '', name: s?.name ?? '', phone: s?.phone ?? '', address: s?.address ?? '', slot: s?.slot ?? '', starts_on: today(), notes: s?.notes ?? '', amount: '', mode: 'upi' });
    setErrors({});
  }, [sub]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = (plans.data ?? []).filter((p) => p.is_active);
  const plan = active.find((p) => String(p.id) === form.meal_plan_id);
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => s
      ? api.put(`/tenant/tiffin/subscriptions/${s.id}`, { name: form.name, phone: form.phone, address: form.address, notes: form.notes || null })
      : api.post('/tenant/tiffin/subscriptions', { ...form, meal_plan_id: Number(form.meal_plan_id) || null, slot: form.slot || null, notes: form.notes || null, amount: form.amount === '' ? null : Number(form.amount) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tiffin'] });
      toast.success(s ? t('common.saved') : t('tiffin.started'));
      onClose();
    },
    onError: (e) => setErrors(fieldErrors(e)),
  });
  if (!sub) return null;
  return (
    <Dialog open onClose={onClose} title={s ? t('tiffin.editSub', { code: s.code }) : t('tiffin.newSub')} wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!s && (
            <Field label={t('tiffin.plan')} error={errors.meal_plan_id}>
              {(a) => (
                <select {...a} className="field-input" value={form.meal_plan_id} onChange={(e) => {
                  const p = active.find((x) => String(x.id) === e.target.value);
                  setForm({ ...form, meal_plan_id: e.target.value, amount: p ? String(Number(p.price)) : form.amount, slot: p?.slot ?? '' });
                }}>
                  <option value="">{t('tiffin.pickPlan')}</option>
                  {active.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatMoney(p.price)}</option>)}
                </select>
              )}
            </Field>
          )}
          {!s && plan?.slot === 'both' && (
            <Field label={t('tiffin.meal')} error={errors.slot}>{(a) => <select {...a} className="field-input" value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value })}>{(['both', 'lunch', 'dinner'] as const).map((x) => <option key={x} value={x}>{t(`tiffin.slot.${x}`)}</option>)}</select>}</Field>
          )}
          <Field label={t('tiffin.name')} error={errors.name}>{(a) => <input {...a} className="field-input" maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
          <Field label={t('tiffin.phone')} error={errors.phone}>{(a) => <input {...a} type="tel" inputMode="tel" className="field-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</Field>
        </div>
        <Field label={t('tiffin.address')} error={errors.address}>{(a) => <textarea {...a} rows={2} className="field-input" maxLength={300} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />}</Field>
        <Field label={t('tiffin.notes')} optional hint={t('tiffin.notesHint')} error={errors.notes}>{(a) => <input {...a} className="field-input" maxLength={300} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}</Field>
        {!s && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={t('tiffin.startsOn')} error={errors.starts_on}>{(a) => <input {...a} type="date" className="field-input" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} />}</Field>
            <Field label={t('tiffin.amount')} error={errors.amount}>{(a) => <input {...a} type="number" min={0} className="field-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />}</Field>
            <Field label={t('tiffin.mode')} error={errors.mode}>{(a) => <select {...a} className="field-input" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>{MODES.map((m) => <option key={m} value={m}>{t(`tiffin.modes.${m}`)}</option>)}</select>}</Field>
          </div>
        )}
        {errors._ && <p className="text-sm font-semibold text-danger" role="alert">{errors._}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : s ? t('common.save') : t('tiffin.startSub')}</button>
        </div>
      </form>
    </Dialog>
  );
}

const FILTERS = ['open', 'requested', 'active', 'paused', 'completed', 'cancelled'] as const;

function SubscribersTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('open');
  const [editing, setEditing] = useState<Sub | 'new' | null>(null);
  const [paying, setPaying] = useState<{ sub: Sub; kind: 'activate' | 'renew' } | null>(null);
  const q = useQuery({ queryKey: ['tiffin', 'subs', filter], queryFn: async () => api.get<Sub[]>(`/tenant/tiffin/subscriptions?status=${filter}`) });
  const act = useMutation<unknown, ApiError, { id: number; action: 'pause' | 'resume' | 'cancel' }>({
    mutationFn: ({ id, action }) => api.post(`/tenant/tiffin/subscriptions/${id}/${action}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tiffin'] }),
    onError: (e) => toast.error(e.message),
  });
  const meta = (q.data?.meta ?? {}) as { requested?: number; active?: number; ending_soon?: number };
  const list = q.data?.data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary !min-h-10 text-sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" /> {t('tiffin.newSub')}</button>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${filter === f ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
              {t(`tiffin.filter.${f}`)}{f === 'requested' && meta.requested ? ` (${meta.requested})` : ''}
            </button>
          ))}
        </div>
      </div>
      {!!meta.ending_soon && <p className="rounded-xl bg-warn/10 px-4 py-2.5 text-sm font-semibold text-warn">{t('tiffin.endingSoon', { count: meta.ending_soon })}</p>}
      {q.isLoading ? <SkeletonRows rows={4} /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} /> : !list.length ? (
        <EmptyState title={t('tiffin.noSubs')}>{t('tiffin.noSubsText')}</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((s) => {
            const pct = s.meals_total ? Math.round((s.meals_used / s.meals_total) * 100) : 0;
            return (
              <li key={s.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-bold">{s.name} <Badge tone={TONE[s.status]}>{t(`tiffin.status.${s.status}`)}</Badge>{s.source === 'website' && <span className="text-xs font-semibold text-muted">{t('tiffin.fromWebsite')}</span>}</p>
                    <p className="text-sm text-muted">{s.code} · {s.plan?.name ?? '—'} · {t(`tiffin.slot.${s.slot}`)}</p>
                    <p className="mt-1 text-sm">{s.address}</p>
                  </div>
                  <a href={waTo(s.phone)} target="_blank" rel="noreferrer" className="btn-ghost !min-h-9 !px-2" aria-label={t('tiffin.chat', { name: s.name })}><MessageCircle className="h-4 w-4" aria-hidden="true" /></a>
                </div>
                {s.status === 'requested' ? (
                  <p className="mt-2 text-sm text-muted">{t('tiffin.wantsFrom', { date: shortDate(s.starts_on), phone: s.phone })}</p>
                ) : (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs font-semibold text-muted">
                      <span>{t('tiffin.used', { used: s.meals_used, total: s.meals_total })}</span>
                      {s.ends_on && <span>{t('tiffin.validTill', { date: shortDate(s.ends_on) })}</span>}
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
                    <p className="mt-1 text-xs text-muted">{t('tiffin.paid', { amount: formatMoney(s.amount_paid) })}{s.paused_on && <> · {t('tiffin.pausedSince', { date: shortDate(s.paused_on) })}</>}</p>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.status === 'requested' && <button type="button" className="btn-primary !min-h-9 text-sm" onClick={() => setPaying({ sub: s, kind: 'activate' })}><Check className="h-4 w-4" aria-hidden="true" /> {t('tiffin.confirm')}</button>}
                  {s.status === 'active' && <button type="button" className="btn-ghost !min-h-9 text-sm" onClick={() => act.mutate({ id: s.id, action: 'pause' })}><Pause className="h-4 w-4" aria-hidden="true" /> {t('tiffin.pause')}</button>}
                  {s.status === 'paused' && <button type="button" className="btn-primary !min-h-9 text-sm" onClick={() => act.mutate({ id: s.id, action: 'resume' })}><Play className="h-4 w-4" aria-hidden="true" /> {t('tiffin.resume')}</button>}
                  {['active', 'paused', 'completed'].includes(s.status) && <button type="button" className={`${s.status === 'completed' ? 'btn-primary' : 'btn-ghost'} !min-h-9 text-sm`} onClick={() => setPaying({ sub: s, kind: 'renew' })}><RefreshCw className="h-4 w-4" aria-hidden="true" /> {t('tiffin.renew')}</button>}
                  {s.status !== 'cancelled' && <button type="button" className="btn-ghost !min-h-9 text-sm" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" aria-hidden="true" /> {t('common.edit')}</button>}
                  {['requested', 'active', 'paused'].includes(s.status) && <button type="button" className="btn-ghost !min-h-9 text-sm text-danger" onClick={() => window.confirm(t('tiffin.cancelConfirm', { name: s.name })) && act.mutate({ id: s.id, action: 'cancel' })}><X className="h-4 w-4" aria-hidden="true" /> {t('tiffin.cancel')}</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <SubscriberDialog sub={editing} onClose={() => setEditing(null)} />
      <PaymentDialog target={paying} onClose={() => setPaying(null)} />
    </div>
  );
}

// ——— Plans ———

function PlanDialog({ plan, onClose }: { plan: Plan | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const p = plan === 'new' ? null : plan;
  const [form, setForm] = useState({ name: '', description: '', diet: '', slot: 'lunch', meals: '26', days_valid: '30', price: '', is_active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (plan) setForm({ name: p?.name ?? '', description: p?.description ?? '', diet: p?.diet ?? '', slot: p?.slot ?? 'lunch', meals: String(p?.meals ?? 26), days_valid: String(p?.days_valid ?? 30), price: p ? String(Number(p.price)) : '', is_active: p?.is_active ?? true });
    setErrors({});
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => {
      const body = { ...form, description: form.description || null, diet: form.diet || null, meals: Number(form.meals), days_valid: Number(form.days_valid), price: form.price === '' ? null : Number(form.price) };
      return p ? api.put(`/tenant/tiffin/plans/${p.id}`, body) : api.post('/tenant/tiffin/plans', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tiffin', 'plans'] });
      toast.success(t('common.saved'));
      onClose();
    },
    onError: (e) => setErrors(fieldErrors(e)),
  });
  if (!plan) return null;
  const perMeal = Number(form.price) && Number(form.meals) ? Number(form.price) / Number(form.meals) : 0;
  return (
    <Dialog open onClose={onClose} title={p ? t('tiffin.editPlan', { name: p.name }) : t('tiffin.addPlan')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate>
        <Field label={t('tiffin.planName')} error={errors.name}>{(a) => <input {...a} className="field-input" maxLength={100} placeholder={t('tiffin.planNamePlaceholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <Field label={t('tiffin.planDescription')} optional hint={t('tiffin.planDescriptionHint')} error={errors.description}>{(a) => <textarea {...a} rows={2} className="field-input" maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('tiffin.meal')} error={errors.slot}>{(a) => <select {...a} className="field-input" value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value })}>{(['lunch', 'dinner', 'both'] as const).map((x) => <option key={x} value={x}>{t(`tiffin.slot.${x}`)}</option>)}</select>}</Field>
          <Field label={t('tiffin.diet')} optional error={errors.diet}>{(a) => <select {...a} className="field-input" value={form.diet} onChange={(e) => setForm({ ...form, diet: e.target.value })}><option value="">—</option><option value="veg">{t('tiffin.veg')}</option><option value="non_veg">{t('tiffin.nonVeg')}</option></select>}</Field>
          <Field label={t('tiffin.meals')} hint={t('tiffin.mealsHint')} error={errors.meals}>{(a) => <input {...a} type="number" min={1} max={200} className="field-input" value={form.meals} onChange={(e) => setForm({ ...form, meals: e.target.value })} />}</Field>
          <Field label={t('tiffin.daysValid')} error={errors.days_valid}>{(a) => <input {...a} type="number" min={1} max={120} className="field-input" value={form.days_valid} onChange={(e) => setForm({ ...form, days_valid: e.target.value })} />}</Field>
          <Field label={t('tiffin.price')} hint={perMeal ? t('tiffin.perMeal', { price: formatMoney(perMeal) }) : undefined} error={errors.price}>{(a) => <input {...a} type="number" min={0} className="field-input" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />}</Field>
        </div>
        {p && <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label={t('tiffin.planActive')} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button>
        </div>
      </form>
    </Dialog>
  );
}

function PlansTab() {
  const { t } = useTranslation();
  const canEdit = useCan('menu.manage');
  const q = usePlans();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  if (q.isLoading) return <SkeletonRows rows={3} />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />;
  const plans = q.data!;
  return (
    <div className="space-y-4">
      {canEdit && <button type="button" className="btn-primary !min-h-10 text-sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" /> {t('tiffin.addPlan')}</button>}
      {!plans.length ? <EmptyState title={t('tiffin.noPlans')}>{t('tiffin.noPlansText')}</EmptyState> : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <li key={p.id} className={`card p-4 ${p.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">{p.name}</p>
                  <p className="text-sm text-muted">{t(`tiffin.slot.${p.slot}`)}{p.diet && <> · {t(p.diet === 'veg' ? 'tiffin.veg' : 'tiffin.nonVeg')}</>}</p>
                </div>
                {canEdit && <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={() => setEditing(p)} aria-label={t('tiffin.editPlan', { name: p.name })}><Pencil className="h-4 w-4" aria-hidden="true" /></button>}
              </div>
              {p.description && <p className="mt-2 text-sm">{p.description}</p>}
              <p className="mt-3 text-2xl font-extrabold tabular-nums">{formatMoney(p.price)}</p>
              <p className="text-sm text-muted">{t('tiffin.planSummary', { meals: p.meals, days: p.days_valid, per: formatMoney(Number(p.price) / p.meals) })}</p>
              {!p.is_active && <p className="mt-1 text-xs font-semibold text-muted">{t('tiffin.hidden')}</p>}
            </li>
          ))}
        </ul>
      )}
      <PlanDialog plan={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

export default function TiffinPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'today' | 'subscribers' | 'plans'>('today');
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight"><CookingPot className="h-7 w-7" aria-hidden="true" /> {t('tiffin.title')}</h1>
          <p className="text-muted">{t('tiffin.subtitle')}</p>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-ink/5 p-1" role="tablist">
          {(['today', 'subscribers', 'plans'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-surface shadow' : 'text-muted'}`}>{t(`tiffin.tab.${k}`)}</button>
          ))}
        </div>
      </div>
      {tab === 'today' ? <TodayTab /> : tab === 'subscribers' ? <SubscribersTab /> : <PlansTab />}
    </div>
  );
}
