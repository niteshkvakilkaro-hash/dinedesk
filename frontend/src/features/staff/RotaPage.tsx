import { useEffect, useState } from 'react';
import { intlLocale } from '@/i18n/locale';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarClock, ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Badge, Dialog, EmptyState, ErrorState, Field, SkeletonRows, Spinner, toast } from '@/components/ui';
import { addDays, clockTime, dayLabel, hhmm, hm, shortTime, todayYmd } from './time';

interface Person { id: number; name: string; role: string | null }
interface Shift { id: number; user_id: number; date: string; starts: string; ends: string; note: string | null }
interface Week { start: string; days: string[]; staff: Person[]; shifts: Shift[]; worked: Record<string, { minutes: number; open: boolean }> }
interface Entry { id: number; user_id: number; date: string; clock_in: string; clock_out: string | null; minutes: number; source: 'self' | 'manager'; note: string | null }
interface Row { user_id: number; name: string; role: string | null; scheduled: number; present: number; absent: number; late: number; minutes: number }
interface Report { from: string; to: string; grace: number; rows: Row[]; entries: Entry[] }

const fieldErrors = (e: ApiError) => (e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])) : { _: e.message });

function ShiftDialog({ shift, staff, onClose }: { shift: Partial<Shift> | null; staff: Person[]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({ user_id: '', date: '', starts: '09:00', ends: '17:00', note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (shift) setForm({ user_id: shift.user_id ? String(shift.user_id) : '', date: shift.date ?? todayYmd(), starts: shift.starts ?? '09:00', ends: shift.ends ?? '17:00', note: shift.note ?? '' });
    setErrors({});
  }, [shift]);
  const done = (msg: string) => {
    void qc.invalidateQueries({ queryKey: ['rota'] });
    toast.success(msg);
    onClose();
  };
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => {
      const body = { ...form, user_id: Number(form.user_id) || null, note: form.note || null };
      return shift?.id ? api.put(`/tenant/shifts/${shift.id}`, body) : api.post('/tenant/shifts', body);
    },
    onSuccess: () => done(t('common.saved')),
    onError: (e) => setErrors(fieldErrors(e)),
  });
  const remove = useMutation<unknown, ApiError>({ mutationFn: () => api.delete(`/tenant/shifts/${shift!.id}`), onSuccess: () => done(t('rota.shiftRemoved')), onError: (e) => toast.error(e.message) });
  if (!shift) return null;
  return (
    <Dialog open onClose={onClose} title={shift.id ? t('rota.editShift') : t('rota.addShift')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('rota.person')} error={errors.user_id}>
            {(a) => (
              <select {...a} className="field-input" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
                <option value="">{t('rota.pickPerson')}</option>
                {staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </Field>
          <Field label={t('rota.date')} error={errors.date}>{(a) => <input {...a} type="date" className="field-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />}</Field>
          <Field label={t('rota.starts')} error={errors.starts}>{(a) => <input {...a} type="time" className="field-input" value={form.starts} onChange={(e) => setForm({ ...form, starts: e.target.value })} />}</Field>
          <Field label={t('rota.ends')} hint={t('rota.endsHint')} error={errors.ends}>{(a) => <input {...a} type="time" className="field-input" value={form.ends} onChange={(e) => setForm({ ...form, ends: e.target.value })} />}</Field>
        </div>
        <Field label={t('rota.note')} optional error={errors.note}>{(a) => <input {...a} className="field-input" maxLength={100} placeholder={t('rota.notePlaceholder')} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />}</Field>
        {errors._ && <p className="text-sm font-semibold text-danger" role="alert">{errors._}</p>}
        <div className="flex flex-wrap justify-between gap-2">
          {shift.id ? <button type="button" className="btn-ghost text-danger" onClick={() => remove.mutate()} disabled={remove.isPending}><Trash2 className="h-4 w-4" aria-hidden="true" /> {t('common.remove')}</button> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function RotaTab() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const locale = intlLocale(i18n.language);
  const [start, setStart] = useState(todayYmd());
  const [editing, setEditing] = useState<Partial<Shift> | null>(null);
  const q = useQuery({ queryKey: ['rota', 'week', start], queryFn: async () => (await api.get<Week>(`/tenant/shifts?start=${start}`)).data });
  const copy = useMutation<{ copied: number }, ApiError>({
    mutationFn: async () => (await api.post<{ copied: number }>('/tenant/shifts/copy-week', { start: q.data!.start })).data,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['rota'] });
      toast.success(t('rota.copied', { count: r.copied }));
    },
    onError: (e) => toast.error(e.message),
  });
  if (q.isLoading) return <SkeletonRows rows={5} />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />;
  const w = q.data!;
  const today = todayYmd();
  const total = w.shifts.length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" className="btn-ghost !min-h-10 !px-2" onClick={() => setStart(addDays(w.start, -7))} aria-label={t('rota.prevWeek')}><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
          <p className="min-w-40 text-center font-bold">{t('rota.weekOf', { date: new Date(`${w.start}T00:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }) })}</p>
          <button type="button" className="btn-ghost !min-h-10 !px-2" onClick={() => setStart(addDays(w.start, 7))} aria-label={t('rota.nextWeek')}><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
        </div>
        <button type="button" className="btn-ghost !min-h-10 text-sm" onClick={() => setStart(todayYmd())}>{t('rota.thisWeek')}</button>
        <div className="ml-auto flex flex-wrap gap-2">
          {total === 0 && <button type="button" className="btn-ghost !min-h-10 border border-line text-sm" onClick={() => copy.mutate()} disabled={copy.isPending}><Copy className="h-4 w-4" aria-hidden="true" /> {t('rota.copyLast')}</button>}
          <button type="button" className="btn-primary !min-h-10 text-sm" onClick={() => setEditing({ date: w.days.includes(today) ? today : w.start })}><Plus className="h-4 w-4" aria-hidden="true" /> {t('rota.addShift')}</button>
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="p-3">{t('rota.person')}</th>
              {w.days.map((d) => <th key={d} className={`p-3 ${d === today ? 'text-brand' : ''}`}>{dayLabel(d, locale)}</th>)}
            </tr>
          </thead>
          <tbody>
            {w.staff.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0 align-top">
                <td className="p-3">
                  <p className="font-semibold">{p.name}</p>
                  {p.role && <p className="text-xs text-muted">{t(`roles.${p.role}`)}</p>}
                </td>
                {w.days.map((d) => {
                  const shifts = w.shifts.filter((s) => s.user_id === p.id && s.date === d);
                  const worked = w.worked[`${p.id}|${d}`];
                  return (
                    <td key={d} className={`p-2 ${d === today ? 'bg-brand/5' : ''}`}>
                      <div className="flex min-h-12 flex-col gap-1">
                        {shifts.map((s) => (
                          <button key={s.id} type="button" onClick={() => setEditing(s)} className="rounded-lg bg-ink/5 px-2 py-1 text-left text-xs font-semibold hover:bg-ink/10" title={s.note ?? undefined}>
                            {shortTime(s.starts)}–{shortTime(s.ends)}
                            {s.note && <span className="block truncate font-normal text-muted">{s.note}</span>}
                          </button>
                        ))}
                        {worked && <span className={`text-xs font-semibold ${worked.open ? 'text-success' : 'text-muted'}`}>{worked.open ? t('rota.inNow') : t('rota.worked', { time: hm(worked.minutes) })}</span>}
                        <button type="button" onClick={() => setEditing({ user_id: p.id, date: d })} className="rounded-lg border border-dashed border-line px-2 py-0.5 text-xs text-muted hover:border-ink hover:text-ink" aria-label={t('rota.addFor', { name: p.name, date: dayLabel(d, locale) })}>+</button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted">{t('rota.howTo')}</p>
      <ShiftDialog shift={editing} staff={w.staff} onClose={() => setEditing(null)} />
    </div>
  );
}

function EntryDialog({ entry, staff, onClose }: { entry: Partial<Entry> | null; staff: Person[]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({ user_id: '', date: '', clock_in: '', clock_out: '', note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (entry) setForm({ user_id: entry.user_id ? String(entry.user_id) : '', date: entry.date ?? todayYmd(), clock_in: entry.clock_in ? hhmm(entry.clock_in) : '', clock_out: entry.clock_out ? hhmm(entry.clock_out) : '', note: entry.note ?? '' });
    setErrors({});
  }, [entry]);
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['rota'] });
    toast.success(t('common.saved'));
    onClose();
  };
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => {
      const body = { ...form, user_id: Number(form.user_id) || null, clock_out: form.clock_out || null, note: form.note || null };
      return entry?.id ? api.put(`/tenant/attendance/${entry.id}`, body) : api.post('/tenant/attendance', body);
    },
    onSuccess: done,
    onError: (e) => setErrors(fieldErrors(e)),
  });
  const remove = useMutation<unknown, ApiError>({ mutationFn: () => api.delete(`/tenant/attendance/${entry!.id}`), onSuccess: done, onError: (e) => toast.error(e.message) });
  if (!entry) return null;
  return (
    <Dialog open onClose={onClose} title={entry.id ? t('rota.editEntry') : t('rota.addEntry')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate>
        <p className="text-sm text-muted">{t('rota.entryHint')}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('rota.person')} error={errors.user_id}>
            {(a) => (
              <select {...a} className="field-input" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} disabled={!!entry.id}>
                <option value="">{t('rota.pickPerson')}</option>
                {staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </Field>
          <Field label={t('rota.date')} error={errors.date}>{(a) => <input {...a} type="date" max={todayYmd()} className="field-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />}</Field>
          <Field label={t('rota.in')} error={errors.clock_in}>{(a) => <input {...a} type="time" className="field-input" value={form.clock_in} onChange={(e) => setForm({ ...form, clock_in: e.target.value })} />}</Field>
          <Field label={t('rota.out')} optional error={errors.clock_out}>{(a) => <input {...a} type="time" className="field-input" value={form.clock_out} onChange={(e) => setForm({ ...form, clock_out: e.target.value })} />}</Field>
        </div>
        <Field label={t('rota.note')} optional error={errors.note}>{(a) => <input {...a} className="field-input" maxLength={150} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />}</Field>
        {errors._ && <p className="text-sm font-semibold text-danger" role="alert">{errors._}</p>}
        <div className="flex flex-wrap justify-between gap-2">
          {entry.id ? <button type="button" className="btn-ghost text-danger" onClick={() => window.confirm(t('rota.removeEntryConfirm')) && remove.mutate()} disabled={remove.isPending}><Trash2 className="h-4 w-4" aria-hidden="true" /> {t('common.remove')}</button> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function AttendanceTab() {
  const { t, i18n } = useTranslation();
  const locale = intlLocale(i18n.language);
  const [range, setRange] = useState({ from: `${todayYmd().slice(0, 8)}01`, to: todayYmd() });
  const [editing, setEditing] = useState<Partial<Entry> | null>(null);
  const q = useQuery({ queryKey: ['rota', 'attendance', range], queryFn: async () => (await api.get<Report>(`/tenant/attendance?from=${range.from}&to=${range.to}`)).data });
  const r = q.data;
  const names = Object.fromEntries((r?.rows ?? []).map((x) => [x.user_id, x.name]));
  const staff: Person[] = (r?.rows ?? []).map((x) => ({ id: x.user_id, name: x.name, role: x.role }));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-muted">{t('rota.from')}<input type="date" className="field-input mt-1" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} /></label>
        <label className="text-xs font-semibold text-muted">{t('rota.to')}<input type="date" className="field-input mt-1" value={range.to} min={range.from} max={todayYmd()} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} /></label>
        <button type="button" className="btn-primary !min-h-10 ml-auto text-sm" onClick={() => setEditing({})} disabled={!r}><Plus className="h-4 w-4" aria-hidden="true" /> {t('rota.addEntry')}</button>
      </div>
      {q.isLoading ? <SkeletonRows rows={5} /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} /> : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="p-3">{t('rota.person')}</th>
                  <th className="p-3 text-right">{t('rota.scheduled')}</th>
                  <th className="p-3 text-right">{t('rota.present')}</th>
                  <th className="p-3 text-right">{t('rota.absent')}</th>
                  <th className="p-3 text-right">{t('rota.late', { grace: r!.grace })}</th>
                  <th className="p-3 text-right">{t('rota.hours')}</th>
                </tr>
              </thead>
              <tbody>
                {r!.rows.map((x) => (
                  <tr key={x.user_id} className="border-b border-line last:border-0">
                    <td className="p-3"><p className="font-semibold">{x.name}</p>{x.role && <p className="text-xs text-muted">{t(`roles.${x.role}`)}</p>}</td>
                    <td className="p-3 text-right tabular-nums">{x.scheduled}</td>
                    <td className="p-3 text-right tabular-nums font-semibold">{x.present}</td>
                    <td className={`p-3 text-right tabular-nums ${x.absent ? 'font-bold text-danger' : 'text-muted'}`}>{x.absent}</td>
                    <td className={`p-3 text-right tabular-nums ${x.late ? 'font-bold text-warn' : 'text-muted'}`}>{x.late}</td>
                    <td className="p-3 text-right tabular-nums font-semibold">{hm(x.minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="pt-2 text-lg font-bold">{t('rota.entries')}</h2>
          {!r!.entries.length ? <EmptyState title={t('rota.noEntries')}>{t('rota.noEntriesText')}</EmptyState> : (
            <ul className="card divide-y divide-line">
              {r!.entries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{names[e.user_id] ?? '—'} <span className="font-normal text-muted">· {new Date(`${e.date}T00:00:00Z`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span></p>
                    <p className="text-muted">
                      {clockTime(e.clock_in)} – {e.clock_out ? clockTime(e.clock_out) : t('rota.stillIn')}
                      {e.note && <> · {e.note}</>}
                    </p>
                  </div>
                  {e.source === 'manager' && <Badge tone="pending">{t('rota.byManager')}</Badge>}
                  <span className="tabular-nums font-semibold">{hm(e.minutes)}</span>
                  <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={() => setEditing(e)} aria-label={t('rota.editEntry')}><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <EntryDialog entry={editing} staff={staff} onClose={() => setEditing(null)} />
    </div>
  );
}

export default function RotaPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'rota' | 'attendance'>('rota');
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight"><CalendarClock className="h-7 w-7" aria-hidden="true" /> {t('rota.title')}</h1>
          <p className="text-muted">{t('rota.subtitle')}</p>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-ink/5 p-1" role="tablist">
          {(['rota', 'attendance'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-surface shadow' : 'text-muted'}`}>{t(`rota.tab.${k}`)}</button>
          ))}
        </div>
      </div>
      {tab === 'rota' ? <RotaTab /> : <AttendanceTab />}
    </div>
  );
}
