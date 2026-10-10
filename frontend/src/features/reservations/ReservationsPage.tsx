import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Phone, Plus, RefreshCw, Search, Trash2, Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatPhone, formatTime, isIndianMobile } from '@/lib/format';
import { tenantSiteUrl } from '@/lib/host';
import { useSession } from '@/hooks/useSession';
import { Alert, Badge, Dialog, EmptyState, ErrorState, Field, SkeletonRows, Spinner, toast, Toggle } from '@/components/ui';
import { HolidaysEditor } from '@/components/HolidaysEditor';
import { DAYS } from '@/components/HoursEditor';
import type { ReservationStatus } from '@/site/reservations';
import { shiftDate, todayIn, useReservations, useReservationSettings, type ReservationList, type ReservationSettings, type SettingsPayload, type Slot, type StaffAvailability, type StaffReservation } from './api';

const TONE: Record<ReservationStatus, string> = {
  pending: 'pending',
  confirmed: 'confirmed',
  seated: 'ready',
  completed: 'completed',
  rejected: 'cancelled',
  cancelled: 'cancelled',
  no_show: 'failed',
};

const FILTERS = ['', 'upcoming', 'pending', 'confirmed', 'seated', 'completed', 'cancelled', 'rejected', 'no_show'] as const;

function dayLabel(date: string, lang: string) {
  return new Intl.DateTimeFormat(lang.startsWith('hi') ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

/** Reject / cancel with an optional reason the guest will see. */
function ReasonDialog({ target, onClose }: { target: { r: StaffReservation; to: 'rejected' | 'cancelled' } | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => api.post(`/tenant/reservations/${target!.r.id}/status`, { status: target!.to, note: note || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reservations'] });
      toast.success(t(`reservationsAdmin.done.${target!.to}`));
      setNote('');
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  if (!target) return null;
  return (
    <Dialog open onClose={onClose} title={target.to === 'rejected' ? t('reservationsAdmin.rejectTitle', { name: target.r.name }) : t('reservationsAdmin.cancelTitle', { name: target.r.name })}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label={t('reservationsAdmin.reason')} optional hint={t('reservationsAdmin.reasonHint')}>
          {(a) => <textarea {...a} className="field-input" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} data-autofocus />}
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.back')}
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : target.to === 'rejected' ? t('reservationsAdmin.action.rejected') : t('reservationsAdmin.action.cancelled')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function BookingCard({ r, tables, showDate, onAsk }: { r: StaffReservation; tables: ReservationList['tables']; showDate: boolean; onAsk: (to: 'rejected' | 'cancelled') => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const move = useMutation<unknown, ApiError, ReservationStatus>({
    mutationFn: (to) => api.post(`/tenant/reservations/${r.id}/status`, { status: to }),
    onSuccess: (_d, to) => {
      void qc.invalidateQueries({ queryKey: ['reservations'] });
      toast.success(t(`reservationsAdmin.done.${to}`));
    },
    onError: (e) => toast.error(e.message),
  });
  const table = useMutation<unknown, ApiError, number | null>({
    mutationFn: (id) => api.put(`/tenant/reservations/${r.id}/table`, { dining_table_id: id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['reservations'] }),
    onError: (e) => toast.error(e.message),
  });
  const primary = r.next.find((n) => ['confirmed', 'seated', 'completed'].includes(n));
  const others = r.next.filter((n) => n !== primary);
  const past = new Date(r.starts_at).getTime() < Date.now();

  return (
    <li className={`card p-4 sm:p-5 ${r.status === 'pending' ? '!border-warn ring-2 ring-warn/25' : ''}`}>
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <div className="w-20 shrink-0">
          <p className="text-2xl font-extrabold tabular-nums leading-none">{formatTime(r.time).replace(' ', ' ')}</p>
          {showDate && <p className="mt-1 text-xs text-muted">{new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${r.date}T12:00:00Z`))}</p>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">{r.name}</p>
            <span className="inline-flex items-center gap-1 text-sm text-muted">
              <Users className="h-4 w-4" aria-hidden="true" />
              {t('reservationsAdmin.guests', { count: r.party_size })}
            </span>
            <Badge tone={TONE[r.status]}>{t(`site.res.status.${r.status}`)}</Badge>
            {r.source !== 'website' && <Badge tone="unpaid">{t(`reservationsAdmin.source.${r.source}`)}</Badge>}
          </div>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 font-semibold hover:underline">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              {formatPhone(r.phone)}
            </a>
            <span className="font-mono text-muted">{r.code}</span>
            {r.email && <span className="text-muted">{r.email}</span>}
          </p>
          {r.notes && <p className="mt-2 rounded-lg bg-ink/5 px-3 py-2 text-sm">“{r.notes}”</p>}
          {r.staff_note && <p className="mt-2 text-sm text-muted">{t('reservationsAdmin.staffNote')}: {r.staff_note}</p>}
          {r.cancelled_by === 'guest' && <p className="mt-2 text-sm font-semibold text-danger">{t('reservationsAdmin.cancelledByGuest')}</p>}
        </div>
        {tables.length > 0 && ['pending', 'confirmed', 'seated'].includes(r.status) && (
          <label className="w-full sm:w-44">
            <span className="mb-1 block text-xs font-semibold text-muted">{t('reservationsAdmin.table')}</span>
            <select className="field-input !py-2" value={r.table?.id ?? ''} disabled={table.isPending} onChange={(e) => table.mutate(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t('reservationsAdmin.noTable')}</option>
              {tables.map((tb) => (
                <option key={tb.id} value={tb.id} disabled={tb.seats < r.party_size}>
                  {tb.label} · {t('reservationsAdmin.seats', { count: tb.seats })}
                </option>
              ))}
            </select>
          </label>
        )}
        {tables.length === 0 && r.table && <p className="text-sm text-muted">{r.table.label}</p>}
      </div>
      {r.next.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
          {primary && (
            <button type="button" className="btn-primary !min-h-10 text-sm" disabled={move.isPending} onClick={() => move.mutate(primary)}>
              {move.isPending ? <Spinner className="h-4 w-4" /> : t(`reservationsAdmin.action.${primary}`)}
            </button>
          )}
          {others.map((n) =>
            n === 'rejected' || n === 'cancelled' ? (
              <button key={n} type="button" className="btn-outline !min-h-10 text-sm" onClick={() => onAsk(n)}>
                {t(`reservationsAdmin.action.${n}`)}
              </button>
            ) : (
              <button key={n} type="button" className="btn-outline !min-h-10 text-sm" disabled={move.isPending || (n === 'no_show' && !past)} onClick={() => move.mutate(n)}>
                {t(`reservationsAdmin.action.${n}`)}
              </button>
            ),
          )}
        </div>
      )}
      <p className="sr-only">{dayLabel(r.date, i18n.language)}</p>
    </li>
  );
}

/** Phone or walk-in booking: pick a time with live capacity, may go over it on purpose. */
function NewBookingDialog({ open, onClose, date: initialDate, tables, timezone }: { open: boolean; onClose: () => void; date: string; tables: ReservationList['tables']; timezone: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({ date: initialDate, party_size: 2, time: '', name: '', phone: '', email: '', notes: '', source: 'phone' as 'phone' | 'walk_in', dining_table_id: '', force: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) setForm((f) => ({ ...f, date: initialDate < todayIn(timezone) ? todayIn(timezone) : initialDate, time: '' }));
  }, [open, initialDate, timezone]);
  const avail = useQuery({
    queryKey: ['reservation-availability', form.date, form.party_size],
    queryFn: async () => (await api.get<StaffAvailability>('/tenant/reservations/availability', { date: form.date, party_size: form.party_size })).data,
    enabled: open && !!form.date && form.party_size > 0,
  });
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => api.post('/tenant/reservations', { ...form, email: form.email || null, notes: form.notes || null, dining_table_id: form.dining_table_id ? Number(form.dining_table_id) : null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reservations'] });
      toast.success(t('reservationsAdmin.added'));
      setForm((f) => ({ ...f, time: '', name: '', phone: '', email: '', notes: '', force: false }));
      onClose();
    },
    onError: (e) => setErrors(e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])) : { form: e.message }),
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.time) errs.time = t('site.res.err.time');
    if (form.name.trim().length < 2) errs.name = t('order.err.name');
    if (!isIndianMobile(form.phone)) errs.phone = t('order.err.phone');
    setErrors(errs);
    if (!Object.keys(errs).length) save.mutate();
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('reservationsAdmin.newTitle')} wide>
      <form className="space-y-5" onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t('site.res.date')}>{(a) => <input {...a} type="date" className="field-input" min={todayIn(timezone)} value={form.date} onChange={(e) => set('date', e.target.value)} data-autofocus />}</Field>
          <Field label={t('site.res.guests')}>{(a) => <input {...a} type="number" min={1} max={100} className="field-input" value={form.party_size} onChange={(e) => set('party_size', Math.max(1, Number(e.target.value) || 1))} />}</Field>
          <fieldset>
            <legend className="field-label">{t('reservationsAdmin.sourceLabel')}</legend>
            <div className="flex gap-2">
              {(['phone', 'walk_in'] as const).map((s) => (
                <label key={s} className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border px-2 text-sm font-semibold ${form.source === s ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
                  <input type="radio" className="sr-only" checked={form.source === s} onChange={() => set('source', s)} />
                  {t(`reservationsAdmin.source.${s}`)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <fieldset>
          <legend className="field-label">{t('site.res.time')}</legend>
          {avail.isLoading && <Spinner />}
          {avail.data?.problem && <Alert tone="warn">{avail.data.problem.message}</Alert>}
          {avail.data && !avail.data.problem && !avail.data.slots.length && <p className="text-sm text-muted">{t('site.res.noTimes')}</p>}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {avail.data?.slots.map((s) => {
              const blocked = !s.available && !form.force;
              return (
                <button
                  key={s.time}
                  type="button"
                  aria-pressed={form.time === s.time}
                  disabled={blocked}
                  onClick={() => set('time', s.time)}
                  className={`rounded-xl border px-2 py-2 text-left text-sm disabled:opacity-40 ${form.time === s.time ? 'border-ink bg-ink text-paper' : 'border-line'}`}
                >
                  <span className="block font-bold tabular-nums">{formatTime(s.time)}</span>
                  <span className="block text-xs opacity-80">
                    {s.booked}/{s.capacity}
                    {s.reason && ` · ${t(`reservationsAdmin.reason_${s.reason}`)}`}
                  </span>
                </button>
              );
            })}
          </div>
          {errors.time && <p className="field-error">{errors.time}</p>}
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={form.force} onChange={(e) => set('force', e.target.checked)} />
            {t('reservationsAdmin.allowOver')}
          </label>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('order.name')} error={errors.name}>{(a) => <input {...a} className="field-input" value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" />}</Field>
          <Field label={t('order.phone')} error={errors.phone}>{(a) => <input {...a} type="tel" inputMode="tel" className="field-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="off" />}</Field>
          <Field label={t('order.email')} optional error={errors.email}>{(a) => <input {...a} type="email" className="field-input" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" />}</Field>
          {tables.length > 0 && (
            <Field label={t('reservationsAdmin.table')} optional hint={t('reservationsAdmin.tableAuto')}>
              {(a) => (
                <select {...a} className="field-input" value={form.dining_table_id} onChange={(e) => set('dining_table_id', e.target.value)}>
                  <option value="">{t('reservationsAdmin.autoTable')}</option>
                  {tables.map((tb) => (
                    <option key={tb.id} value={tb.id} disabled={tb.seats < form.party_size}>
                      {tb.label} · {t('reservationsAdmin.seats', { count: tb.seats })}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
        </div>
        <Field label={t('site.res.notes')} optional>{(a) => <textarea {...a} rows={2} maxLength={500} className="field-input" value={form.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
        {errors.form && <Alert>{errors.form}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : t('reservationsAdmin.add')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function BookingsTab({ timezone, enabled, onOpenSettings }: { timezone: string; enabled: boolean; onOpenSettings: () => void }) {
  const { t, i18n } = useTranslation();
  const today = todayIn(timezone);
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState<(typeof FILTERS)[number]>('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [asking, setAsking] = useState<{ r: StaffReservation; to: 'rejected' | 'cancelled' } | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  const query = useReservations({ date, status, q });
  const list = query.data?.reservations ?? [];
  const tables = query.data?.tables ?? [];
  const crossDate = !!q || status === 'upcoming';

  return (
    <div className="space-y-4">
      {!enabled && (
        <Alert tone="info">
          {t('reservationsAdmin.offHint')}{' '}
          <button type="button" className="font-bold underline" onClick={onOpenSettings}>
            {t('reservationsAdmin.openSettings')}
          </button>
        </Alert>
      )}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <button type="button" className="btn-ghost !min-h-10 !px-2" onClick={() => setDate(shiftDate(date, -1))} aria-label={t('common.previous')} disabled={crossDate}>
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <label className="relative">
          <span className="sr-only">{t('site.res.date')}</span>
          <input type="date" className="field-input !w-auto !py-2" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} disabled={crossDate} />
        </label>
        <button type="button" className="btn-ghost !min-h-10 !px-2" onClick={() => setDate(shiftDate(date, 1))} aria-label={t('common.next')} disabled={crossDate}>
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
        <button type="button" className="btn-outline !min-h-10 text-sm" onClick={() => setDate(today)} disabled={date === today || crossDate}>
          {t('site.today')}
        </button>
        <label className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input type="search" className="field-input !py-2 !pl-9" placeholder={t('reservationsAdmin.search')} aria-label={t('reservationsAdmin.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={t('reservationsAdmin.filter')}>
        {FILTERS.map((f) => (
          <button key={f || 'all'} type="button" aria-pressed={status === f} onClick={() => setStatus(f)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${status === f ? 'border-ink bg-ink text-paper' : 'border-line bg-surface'}`}>
            {f === '' ? t('reservationsAdmin.all') : f === 'upcoming' ? t('reservationsAdmin.upcoming') : t(`site.res.status.${f}`)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">{crossDate ? (q ? t('reservationsAdmin.results') : t('reservationsAdmin.upcoming')) : dayLabel(date, i18n.language)}</h2>
        <div className="flex items-center gap-3">
          {query.data && !crossDate && <p className="text-sm text-muted">{t('reservationsAdmin.summary', { bookings: query.data.summary.bookings, guests: query.data.summary.guests })}</p>}
          <button type="button" className="btn-primary !min-h-10 text-sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('reservationsAdmin.new')}
          </button>
        </div>
      </div>

      {query.isLoading && <SkeletonRows rows={4} />}
      {query.isError && <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />}
      {query.data && !list.length && <EmptyState title={t('reservationsAdmin.empty')}>{t('reservationsAdmin.emptyHint')}</EmptyState>}
      <ul className="space-y-3">
        {list.map((r) => (
          <BookingCard key={r.id} r={r} tables={tables} showDate={crossDate} onAsk={(to) => setAsking({ r, to })} />
        ))}
      </ul>

      <NewBookingDialog open={adding} onClose={() => setAdding(false)} date={date} tables={tables} timezone={timezone} />
      <ReasonDialog target={asking} onClose={() => setAsking(null)} />
    </div>
  );
}

function SlotsEditor({ payload }: { payload: SettingsPayload }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [slots, setSlots] = useState<Slot[]>(payload.slots);
  const [day, setDay] = useState<string>('mon');
  const [error, setError] = useState('');
  useEffect(() => setSlots(payload.slots), [payload.slots]);
  const daySlots = slots.map((s, i) => ({ s, i })).filter((x) => x.s.day === day).sort((a, b) => a.s.time.localeCompare(b.s.time));
  const save = useMutation<{ data: SettingsPayload }, ApiError, Slot[]>({
    mutationFn: (body) => api.put<SettingsPayload>('/tenant/reservations/slots', { slots: body }),
    onSuccess: (res) => {
      qc.setQueryData(['reservation-settings'], res.data);
      toast.success(t('common.saved'));
      setError('');
    },
    onError: (e) => setError(e.message),
  });
  const update = (i: number, patch: Partial<Slot>) => setSlots((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const add = () => {
    const last = daySlots.at(-1)?.s;
    const next = last ? `${String(Math.min(23, Number(last.time.slice(0, 2)) + 1)).padStart(2, '0')}:${last.time.slice(3)}` : '19:00';
    setSlots((all) => [...all, { day, time: next, capacity: payload.settings.default_capacity, is_active: true }]);
  };
  const copyToAll = () => {
    const mine = slots.filter((s) => s.day === day);
    setSlots(DAYS.flatMap((d) => mine.map((s) => ({ ...s, day: d }))));
  };

  return (
    <section className="card space-y-4 p-5" aria-labelledby="slots-h">
      <div>
        <h2 id="slots-h" className="text-lg font-bold">
          {t('reservationsAdmin.slotsTitle')}
        </h2>
        <p className="text-sm text-muted">{payload.custom_slots ? t('reservationsAdmin.slotsCustom') : t('reservationsAdmin.slotsFromHours')}</p>
      </div>
      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label={t('reservationsAdmin.slotsTitle')}>
        {DAYS.map((d) => (
          <button key={d} type="button" role="tab" aria-selected={day === d} onClick={() => setDay(d)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${day === d ? 'bg-ink text-paper' : 'bg-ink/5'}`}>
            {t(`days.${d}`)} <span className="opacity-70">({slots.filter((s) => s.day === d && s.is_active).length})</span>
          </button>
        ))}
      </div>
      {daySlots.length === 0 && <p className="text-sm text-muted">{t('reservationsAdmin.noSlotsDay')}</p>}
      <ul className="divide-y divide-line">
        {daySlots.map(({ s, i }) => (
          <li key={i} className="flex flex-wrap items-center gap-3 py-2">
            <input type="time" step={900} className="field-input !w-32 !py-2" value={s.time} onChange={(e) => update(i, { time: e.target.value })} aria-label={t('site.res.time')} />
            <label className="flex items-center gap-2 text-sm">
              <input type="number" min={1} max={500} className="field-input !w-24 !py-2" value={s.capacity} onChange={(e) => update(i, { capacity: Math.max(1, Number(e.target.value) || 1) })} />
              {t('reservationsAdmin.guestsPerSlot')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={s.is_active} onChange={(e) => update(i, { is_active: e.target.checked })} />
              {t('reservationsAdmin.open')}
            </label>
            <button type="button" className="btn-ghost ml-auto !min-h-10 !px-2" onClick={() => setSlots((all) => all.filter((_, j) => j !== i))} aria-label={t('common.remove')}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-outline !min-h-10 text-sm" onClick={add}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('reservationsAdmin.addSlot')}
        </button>
        <button type="button" className="btn-ghost !min-h-10 text-sm" onClick={copyToAll} disabled={!daySlots.length}>
          {t('reservationsAdmin.copyDay', { day: t(`days.${day}`) })}
        </button>
        {payload.custom_slots && (
          <button type="button" className="btn-ghost !min-h-10 text-sm" onClick={() => save.mutate([])}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t('reservationsAdmin.useHours')}
          </button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end">
        <button type="button" className="btn-primary" disabled={save.isPending} onClick={() => save.mutate(slots)}>
          {save.isPending ? <Spinner /> : t('reservationsAdmin.saveSlots')}
        </button>
      </div>
    </section>
  );
}

function SettingsTab({ payload, siteUrl }: { payload: SettingsPayload; siteUrl: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<ReservationSettings>(payload.settings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => setForm(payload.settings), [payload.settings]);
  const save = useMutation<{ data: SettingsPayload }, ApiError>({
    mutationFn: () => api.put<SettingsPayload>('/tenant/reservations/settings', form),
    onSuccess: (res) => {
      qc.setQueryData(['reservation-settings'], res.data);
      void qc.invalidateQueries({ queryKey: ['site'] });
      toast.success(t('common.saved'));
      setErrors({});
    },
    onError: (e) => setErrors(e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k.split('.')[0], v[0]])) : { form: e.message }),
  });
  const set = <K extends keyof ReservationSettings>(k: K, v: ReservationSettings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k: keyof ReservationSettings, label: string, hint: string | undefined, min: number, max: number) => (
    <Field label={label} hint={hint} error={errors[k]}>
      {(a) => <input {...a} type="number" min={min} max={max} className="field-input" value={form[k] as number} onChange={(e) => set(k, Number(e.target.value) as never)} />}
    </Field>
  );

  return (
    <div className="space-y-5">
      <form className="card space-y-5 p-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate>
        <div className="divide-y divide-line">
          <Toggle checked={form.enabled} onChange={(v) => set('enabled', v)} label={t('reservationsAdmin.enabled')} hint={t('reservationsAdmin.enabledHint')} />
          <Toggle checked={form.auto_confirm} onChange={(v) => set('auto_confirm', v)} label={t('reservationsAdmin.autoConfirm')} hint={t('reservationsAdmin.autoConfirmHint')} />
          <Toggle checked={form.match_tables} onChange={(v) => set('match_tables', v)} label={t('reservationsAdmin.matchTables')} hint={t('reservationsAdmin.matchTablesHint')} />
        </div>
        {form.enabled && (
          <a href={`${siteUrl}/reserve`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold underline">
            {t('reservationsAdmin.openPublic')} <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t('reservationsAdmin.slotEvery')} error={errors.slot_minutes}>
            {(a) => (
              <select {...a} className="field-input" value={form.slot_minutes} onChange={(e) => set('slot_minutes', Number(e.target.value))}>
                {[15, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {t('reservationsAdmin.minutes', { count: m })}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {num('duration_minutes', t('reservationsAdmin.duration'), t('reservationsAdmin.durationHint'), 30, 300)}
          {num('default_capacity', t('reservationsAdmin.capacity'), t('reservationsAdmin.capacityHint'), 1, 500)}
          {num('min_party', t('reservationsAdmin.minParty'), undefined, 1, 50)}
          {num('max_party', t('reservationsAdmin.maxParty'), t('reservationsAdmin.maxPartyHint'), 1, 100)}
          {num('lead_minutes', t('reservationsAdmin.lead'), t('reservationsAdmin.leadHint'), 0, 2880)}
          {num('max_days', t('reservationsAdmin.maxDays'), undefined, 1, 180)}
          {num('reminder_hours', t('reservationsAdmin.reminder'), t('reservationsAdmin.reminderHint'), 0, 48)}
        </div>
        <div>
          <h3 className="font-bold">{t('reservationsAdmin.blackout')}</h3>
          <p className="mb-3 text-sm text-muted">{t('reservationsAdmin.blackoutHint')}</p>
          <HolidaysEditor value={form.blackout_dates} onChange={(v) => set('blackout_dates', v)} />
        </div>
        {errors.form && <Alert>{errors.form}</Alert>}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : t('common.save')}
          </button>
        </div>
      </form>
      <SlotsEditor payload={payload} />
    </div>
  );
}

export default function ReservationsPage() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const settings = useReservationSettings();
  const [tab, setTab] = useState<'bookings' | 'settings'>('bookings');
  const tenant = session?.tenant;
  const siteUrl = useMemo(() => (tenant ? tenantSiteUrl(tenant.slug) : ''), [tenant]);
  const timezone = 'Asia/Kolkata';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <CalendarDays className="h-7 w-7" aria-hidden="true" />
            {t('reservationsAdmin.title')}
          </h1>
          <p className="text-muted">{t('reservationsAdmin.subtitle')}</p>
        </div>
        <div className="flex gap-1 rounded-full bg-ink/5 p-1" role="tablist">
          {(['bookings', 'settings'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-surface shadow' : 'text-muted'}`}>
              {t(`reservationsAdmin.tab.${k}`)}
            </button>
          ))}
        </div>
      </div>
      {tab === 'bookings' && <BookingsTab timezone={timezone} enabled={!!settings.data?.settings.enabled} onOpenSettings={() => setTab('settings')} />}
      {tab === 'settings' && (settings.isLoading ? <SkeletonRows /> : settings.data ? <SettingsTab payload={settings.data} siteUrl={siteUrl} /> : <ErrorState message={(settings.error as Error | null)?.message} onRetry={() => void settings.refetch()} />)}
    </div>
  );
}
