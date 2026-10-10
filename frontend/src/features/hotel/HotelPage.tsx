import { lazy, Suspense, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BedDouble, ChevronLeft, ChevronRight, Hotel, Phone, Plus, Search, Sparkles } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatDateTime, formatPhone } from '@/lib/format';
import { useLive } from '@/lib/realtime';
import { useDebounced } from '@/hooks/useDebounced';
import { useCan, useSession } from '@/hooks/useSession';
import { Badge, EmptyState, ErrorState, SkeletonRows, Spinner, toast } from '@/components/ui';
import { addDays, BANQUET_STATUSES, HK_STATES, shortDate, STATUS_TONE, todayIst, useToday, type Banquet, type BoardRoom, type CalendarData, type Housekeeping, type Stay, type StayStatus } from './api';
import { StayPanel } from './StayPanel';
import { NewStayDialog } from './NewStayDialog';

const Setup = lazy(() => import('./Setup'));

type Tab = 'today' | 'calendar' | 'bookings' | 'housekeeping' | 'events' | 'setup';

function StayRow({ s, onOpen, hint }: { s: Stay; onOpen: (id: number) => void; hint?: string }) {
  const { t } = useTranslation();
  return (
    <li>
      <button type="button" onClick={() => onOpen(s.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-ink/[0.03]">
        <span>
          <span className="block font-semibold">{s.name} <span className="font-mono text-xs text-muted">{s.code}</span></span>
          <span className="block text-sm text-muted">
            {s.room_type.name}{s.room ? ` · ${t('hotel.roomNo', { number: s.room.number })}` : ` · ${t('hotel.noRoomYet')}`} · {shortDate(s.check_in)} → {shortDate(s.check_out)} · {t('hotel.guestsShort', { count: s.adults + s.children })}
          </span>
          {hint && <span className="block text-xs font-semibold text-warn">{hint}</span>}
        </span>
        <span className="flex items-center gap-2">
          {s.awaiting_payment && <Badge tone="pending">{t('hotel.awaitingAdvance')}</Badge>}
          <Badge tone={STATUS_TONE[s.status]}>{t(`hotel.status.${s.status}`)}</Badge>
        </span>
      </button>
    </li>
  );
}

function List({ title, items, empty, onOpen, hint }: { title: string; items: Stay[]; empty: string; onOpen: (id: number) => void; hint?: (s: Stay) => string | undefined }) {
  return (
    <section className="card overflow-hidden" aria-label={title}>
      <h2 className="border-b border-ink/5 px-4 py-3 font-bold">{title} <span className="text-muted">({items.length})</span></h2>
      {items.length ? <ul className="divide-y divide-ink/5">{items.map((s) => <StayRow key={s.id} s={s} onOpen={onOpen} hint={hint?.(s)} />)}</ul> : <p className="px-4 py-4 text-sm text-muted">{empty}</p>}
    </section>
  );
}

function TodayTab({ onOpen }: { onOpen: (id: number) => void }) {
  const { t } = useTranslation();
  const q = useToday();
  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.isError || !q.data) return <ErrorState message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const stats: [string, number][] = [['rooms', d.stats.rooms], ['occupied', d.stats.occupied], ['freeTonight', d.stats.free_tonight], ['dirty', d.stats.dirty], ['outOfOrder', d.stats.out_of_order]];
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map(([k, v]) => <div key={k} className="card p-4"><dt className="text-sm text-muted">{t(`hotel.stats.${k}`)}</dt><dd className="text-2xl font-extrabold">{v}</dd></div>)}
      </dl>
      {d.stats.rooms === 0 && <EmptyState title={t('hotel.noRoomsTitle')}>{t('hotel.noRoomsText')}</EmptyState>}
      {!!d.requests.length && <List title={t('hotel.requestsTitle')} items={d.requests} empty="" onOpen={onOpen} />}
      <div className="grid gap-5 lg:grid-cols-2">
        <List title={t('hotel.arrivals')} items={d.arrivals} empty={t('hotel.noArrivals')} onOpen={onOpen} hint={(s) => (s.check_in < d.date ? t('hotel.lateArrival') : !s.room ? t('hotel.needsRoom') : s.room.housekeeping !== 'clean' && s.room.housekeeping !== 'inspected' ? t('hotel.roomNotReady') : undefined)} />
        <List title={t('hotel.departures')} items={d.departures} empty={t('hotel.noDepartures')} onOpen={onOpen} hint={(s) => (s.check_out < d.date ? t('hotel.overstay') : undefined)} />
      </div>
      <List title={t('hotel.inHouse')} items={d.in_house} empty={t('hotel.noneInHouse')} onOpen={onOpen} />
    </div>
  );
}

const BAR: Record<StayStatus, string> = {
  pending: 'bg-warn-soft text-warn border-warn/30',
  confirmed: 'bg-brand-soft text-brand-strong border-brand/30',
  checked_in: 'bg-success-soft text-success border-success/30',
  checked_out: 'bg-ink/5 text-muted border-ink/10',
  cancelled: 'bg-ink/5 text-muted border-ink/10',
  no_show: 'bg-ink/5 text-muted border-ink/10',
};

function CalendarTab({ onOpen }: { onOpen: (id: number) => void }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(todayIst());
  const days = 14;
  const q = useQuery({ queryKey: ['hotel', 'calendar', from], queryFn: async () => (await api.get<CalendarData>('/tenant/hotel/calendar', { from, days })).data, placeholderData: keepPreviousData });
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
  const col = (ymd: string) => Math.max(0, Math.round((Date.parse(ymd) - Date.parse(from)) / 86400000));
  const bar = (b: CalendarData['types'][number]['unassigned'][number]) => {
    const start = Math.max(0, col(b.check_in));
    const end = Math.min(days, col(b.check_out));
    if (end <= start) return null;
    return (
      <button key={b.id} type="button" onClick={() => onOpen(b.id)} title={`${b.name} · ${shortDate(b.check_in)} → ${shortDate(b.check_out)}`}
        style={{ gridColumn: `${start + 2} / ${end + 2}`, gridRow: 1 }}
        className={`z-[1] m-0.5 truncate rounded-md border px-1.5 py-1 text-left text-xs font-semibold ${BAR[b.status]}`}>
        {b.name}
      </button>
    );
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-outline !min-h-10 !px-3" onClick={() => setFrom(addDays(from, -7))} aria-label={t('hotel.prevWeek')}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
        <button type="button" className="btn-outline !min-h-10 text-sm" onClick={() => setFrom(todayIst())}>{t('hotel.todayBtn')}</button>
        <button type="button" className="btn-outline !min-h-10 !px-3" onClick={() => setFrom(addDays(from, 7))} aria-label={t('hotel.nextWeek')}><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        <span className="text-sm font-semibold">{shortDate(from)} – {shortDate(addDays(from, days - 1))}</span>
        {q.isFetching && <Spinner />}
      </div>
      {q.isError && <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />}
      {q.data && (
        <div className="card overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid border-b border-ink/10 text-xs" style={{ gridTemplateColumns: `90px repeat(${days}, 1fr)` }}>
              <div className="p-2 font-semibold text-muted">{t('hotel.room')}</div>
              {dates.map((d) => <div key={d} className={`p-2 text-center ${d === todayIst() ? 'font-extrabold text-brand-strong' : 'text-muted'}`}>{shortDate(d, true)}</div>)}
            </div>
            {q.data.types.map((ty) => (
              <div key={ty.id}>
                <p className="bg-ink/[0.03] px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-muted">{ty.name}</p>
                {ty.rooms.map((r) => (
                  <div key={r.id} className="relative grid min-h-10 border-b border-ink/5" style={{ gridTemplateColumns: `90px repeat(${days}, 1fr)` }}>
                    <div className="flex items-center gap-1.5 p-2 text-sm font-semibold" style={{ gridRow: 1, gridColumn: 1 }}>{r.number}<span className={`h-2 w-2 rounded-full ${r.housekeeping === 'clean' || r.housekeeping === 'inspected' ? 'bg-success' : r.housekeeping === 'dirty' ? 'bg-warn' : 'bg-danger'}`} title={t(`hotel.hk.${r.housekeeping}`)} /></div>
                    {r.bookings.map(bar)}
                  </div>
                ))}
                {!!ty.unassigned.length && ty.unassigned.map((b) => (
                  <div key={`u${b.id}`} className="grid min-h-10 border-b border-dashed border-ink/10" style={{ gridTemplateColumns: `90px repeat(${days}, 1fr)` }}>
                    <div className="p-2 text-xs italic text-muted" style={{ gridRow: 1, gridColumn: 1 }}>{t('hotel.noRoomYet')}</div>
                    {bar(b)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BookingsTab({ onOpen }: { onOpen: (id: number) => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('upcoming');
  const term = useDebounced(q.trim(), 300);
  const res = useQuery({
    queryKey: ['hotel', 'bookings', term, status],
    queryFn: async () => (await api.get<Stay[]>('/tenant/hotel/bookings', { q: term || undefined, status: status || undefined })).data,
    placeholderData: keepPreviousData,
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <label className="relative flex-1">
          <span className="sr-only">{t('hotel.search')}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input className="field-input !pl-9" placeholder={t('hotel.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="field-input !w-auto" aria-label={t('hotel.statusFilter')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="upcoming">{t('hotel.upcoming')}</option>
          <option value="">{t('hotel.all')}</option>
          {(['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'] as StayStatus[]).map((s) => <option key={s} value={s}>{t(`hotel.status.${s}`)}</option>)}
        </select>
      </div>
      {res.isLoading && <SkeletonRows rows={5} />}
      {res.isError && <ErrorState message={(res.error as Error).message} onRetry={() => void res.refetch()} />}
      {res.data && (res.data.length ? <ul className="card divide-y divide-ink/5 overflow-hidden">{res.data.map((s) => <StayRow key={s.id} s={s} onOpen={onOpen} />)}</ul> : <EmptyState title={t('hotel.noBookings')}>{t('hotel.noBookingsHint')}</EmptyState>)}
    </div>
  );
}

const HK_STYLE: Record<Housekeeping, string> = {
  clean: 'border-success/40 bg-success-soft',
  inspected: 'border-success/60 bg-success-soft',
  dirty: 'border-warn/40 bg-warn-soft',
  out_of_order: 'border-danger/40 bg-danger-soft',
};

function HousekeepingTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['hotel', 'housekeeping'], queryFn: async () => (await api.get<BoardRoom[]>('/tenant/hotel/housekeeping')).data, refetchInterval: 30_000 });
  const [filter, setFilter] = useState<Housekeeping | ''>('');
  const set = useMutation<BoardRoom[], ApiError, { id: number; status: Housekeeping }>({
    mutationFn: async ({ id, status }) => {
      const note = status === 'out_of_order' ? window.prompt(t('hotel.oooReason')) : null;
      if (status === 'out_of_order' && !note) throw new ApiError('', 0);
      return (await api.post<BoardRoom[]>(`/tenant/hotel/rooms/${id}/housekeeping`, { status, note })).data;
    },
    onSuccess: (d) => { qc.setQueryData(['hotel', 'housekeeping'], d); void qc.invalidateQueries({ queryKey: ['hotel', 'today'] }); },
    onError: (e) => e.message && toast.error(e.message),
  });
  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.isError || !q.data) return <ErrorState message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  const rooms = q.data.filter((r) => !filter || r.housekeeping === filter);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('hotel.hkFilter')}>
        {(['', ...HK_STATES] as const).map((k) => (
          <button key={k || 'all'} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${filter === k ? 'border-ink bg-ink text-paper' : 'border-ink/15'}`}>
            {k ? t(`hotel.hk.${k}`) : t('hotel.all')} ({k ? q.data.filter((r) => r.housekeeping === k).length : q.data.length})
          </button>
        ))}
      </div>
      {!q.data.length && <EmptyState title={t('hotel.noRoomsTitle')}>{t('hotel.noRoomsText')}</EmptyState>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rooms.map((r) => (
          <li key={r.id} className={`rounded-2xl border-2 p-4 ${HK_STYLE[r.housekeeping]}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-2xl font-extrabold">{r.number}</p>
                <p className="text-xs text-muted">{r.type}{r.floor ? ` · ${t('hotel.floor', { floor: r.floor })}` : ''}</p>
              </div>
              <span className="text-right text-xs font-bold">{t(`hotel.hk.${r.housekeeping}`)}</span>
            </div>
            <p className="mt-2 flex flex-wrap gap-1 text-xs">
              {r.occupied && <Badge tone="preparing">{t('hotel.occupied')}</Badge>}
              {r.departing && <Badge tone="pending">{t('hotel.departing')}</Badge>}
              {r.arriving && <Badge tone="confirmed">{t('hotel.arriving')}</Badge>}
            </p>
            {r.note && <p className="mt-1 text-xs">{r.note}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {HK_STATES.filter((s) => s !== r.housekeeping).map((s) => (
                <button key={s} type="button" className="rounded-full border border-ink/20 bg-surface px-2.5 py-1 text-xs font-semibold" disabled={set.isPending} onClick={() => set.mutate({ id: r.id, status: s })}>{t(`hotel.hkSet.${s}`)}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BanquetCard({ e }: { e: Banquet }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const save = useMutation<Banquet, ApiError, Record<string, unknown>>({
    mutationFn: async (body) => (await api.put<Banquet>(`/tenant/hotel/banquets/${e.id}`, body)).data,
    onSuccess: () => { setNote(''); void qc.invalidateQueries({ queryKey: ['hotel', 'banquets'] }); },
    onError: (err) => toast.error(err.message),
  });
  return (
    <li className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold">{e.name} <span className="font-normal text-muted">· {t(`hotel.event.${e.event_type}`)}</span></p>
          <p className="text-sm text-muted">{[e.event_date && formatDate(`${e.event_date}T12:00:00+05:30`), e.guests && t('hotel.guestsShort', { count: e.guests }), formatDateTime(e.created_at)].filter(Boolean).join(' · ')}</p>
        </div>
        <a href={`tel:${e.phone}`} className="btn-outline !min-h-9 text-sm"><Phone className="h-4 w-4" aria-hidden="true" /> {formatPhone(e.phone)}</a>
      </div>
      {e.message && <p className="text-sm">{e.message}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="field-label">{t('hotel.statusLabel')}</span>
          <select className="field-input !py-2" value={e.status} onChange={(x) => save.mutate({ status: x.target.value })}>{BANQUET_STATUSES.map((s) => <option key={s} value={s}>{t(`hotel.banquet.${s}`)}</option>)}</select>
        </label>
        <label className="text-sm">
          <span className="field-label">{t('hotel.followUp')}</span>
          <input type="date" className="field-input !py-2" value={e.follow_up_on ?? ''} onChange={(x) => save.mutate({ follow_up_on: x.target.value || null })} />
        </label>
        <form className="flex flex-1 gap-2" onSubmit={(x) => { x.preventDefault(); if (note.trim()) save.mutate({ note }); }}>
          <input className="field-input !py-2" aria-label={t('hotel.addNote')} placeholder={t('hotel.addNote')} maxLength={500} value={note} onChange={(x) => setNote(x.target.value)} />
          <button type="submit" className="btn-outline !min-h-10 text-sm" disabled={!note.trim() || save.isPending}>{t('hotel.save')}</button>
        </form>
      </div>
      {!!e.notes.length && (
        <ol className="space-y-1 border-l-2 border-ink/10 pl-3 text-xs">
          {e.notes.map((n, i) => <li key={i}><span className="text-muted">{formatDateTime(n.at)} · {n.by}:</span> {n.text ?? t('hotel.statusChanged', { status: t(`hotel.banquet.${n.status}`) })}</li>)}
        </ol>
      )}
    </li>
  );
}

function EventsTab() {
  const { t } = useTranslation();
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['hotel', 'banquets', status], queryFn: async () => (await api.get<Banquet[]>('/tenant/hotel/banquets', { status: status || undefined })).data });
  return (
    <div className="space-y-3">
      <select className="field-input !w-auto" aria-label={t('hotel.statusFilter')} value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">{t('hotel.all')}</option>
        {BANQUET_STATUSES.map((s) => <option key={s} value={s}>{t(`hotel.banquet.${s}`)}</option>)}
      </select>
      {q.isLoading && <SkeletonRows rows={4} />}
      {q.isError && <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />}
      {q.data && (q.data.length ? <ul className="space-y-3">{q.data.map((e) => <BanquetCard key={e.id} e={e} />)}</ul> : <EmptyState title={t('hotel.noEnquiries')}>{t('hotel.noEnquiriesHint')}</EmptyState>)}
    </div>
  );
}

export default function HotelPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const session = useSession().data;
  const canDesk = useCan('rooms.manage');
  const canHk = useCan('housekeeping.update');
  const canSetup = useCan('rooms.setup');
  const tabs = ([...(canDesk ? ['today', 'calendar', 'bookings'] : []), ...(canHk ? ['housekeeping'] : []), ...(canDesk ? ['events'] : []), ...(canSetup ? ['setup'] : [])] as Tab[]);
  const [tab, setTab] = useState<Tab | null>(null);
  const active = tab && tabs.includes(tab) ? tab : tabs[0];
  const [open, setOpen] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  useLive(session?.tenant?.id, 'hotel', canDesk || canHk, () => void qc.invalidateQueries({ queryKey: ['hotel'], predicate: (q) => q.queryKey[1] !== 'settings' && q.queryKey[1] !== 'types' }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight"><Hotel className="h-7 w-7" aria-hidden="true" /> {t('hotel.title')}</h1>
          <p className="text-muted">{t('hotel.subtitle')}</p>
        </div>
        {canDesk && <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" /> {t('hotel.newStay')}</button>}
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex w-max gap-1 rounded-full bg-ink/5 p-1" role="tablist">
          {tabs.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={active === k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${active === k ? 'bg-surface shadow' : 'text-muted'}`}>
              {k === 'housekeeping' ? <Sparkles className="h-4 w-4" aria-hidden="true" /> : k === 'calendar' ? <BedDouble className="h-4 w-4" aria-hidden="true" /> : null}
              {t(`hotel.tab.${k}`)}
            </button>
          ))}
        </div>
      </div>
      {active === 'today' && <TodayTab onOpen={setOpen} />}
      {active === 'calendar' && <CalendarTab onOpen={setOpen} />}
      {active === 'bookings' && <BookingsTab onOpen={setOpen} />}
      {active === 'housekeeping' && <HousekeepingTab />}
      {active === 'events' && <EventsTab />}
      {active === 'setup' && <Suspense fallback={<SkeletonRows rows={6} />}><Setup /></Suspense>}
      <StayPanel id={open} onClose={() => setOpen(null)} />
      <NewStayDialog open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpen(id); }} />
      {!tabs.length && <EmptyState title={t('hotel.noAccess')} />}
    </div>
  );
}
