import { useMemo, useState } from 'react';
import { intlLocale } from '@/i18n/locale';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, LineChart } from 'lucide-react';
import { api, downloadFile } from '@/lib/api';
import { GstPanel } from './GstPanel';
import { formatMoney } from '@/lib/format';
import { ErrorState, SkeletonRows, toast } from '@/components/ui';
import { shiftDate, todayIn } from '@/features/reservations/api';

interface Group { key: string; orders: number; sales: string }
interface Overview {
  from: string; to: string; by: 'day' | 'week' | 'month';
  totals: { orders: number; sales: string; gst: string; discounts: string; average: string; cancelled: number; cancelled_value: string; customers: number; repeat_customers: number; repeat_rate: number | null };
  series: { period: string; orders: number; sales: string }[];
  by_type: Group[]; by_payment: Group[]; by_source: Group[];
  heatmap: { day: number; hour: number; orders: number }[];
  dishes: { top: { name: string; category: string | null; quantity: number; sales: string }[]; slow: { name: string; category: string | null; quantity: number; sales: string }[] };
  categories: { category: string; quantity: number; sales: string; share: number }[];
  reservations: { bookings: number; guests: number; by_status: { key: string; count: number }[]; no_show_rate: number | null };
  offers: { coupon_uses: number; coupon_discount: string; points_earned: number; points_redeemed: number };
  hotel: null | {
    rooms: number; nights_available: number; nights_sold: number; occupancy: number; room_revenue: string; adr: string; revpar: string;
    stays: number; average_nights: number | null; cancelled: number; no_shows: number;
    by_source: { key: string; count: number }[]; by_type: { key: string; count: number; nights: number }[];
    series: { date: string; sold: number; occupancy: number }[];
  };
}

const PRESETS = [7, 30, 90] as const;

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Bars({ title, rows, label }: { title: string; rows: Group[]; label: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.sales)));
  return (
    <section className="card p-5">
      <h2 className="font-bold">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.length === 0 && <li className="text-muted">—</li>}
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex justify-between gap-2"><span>{label(r.key)} <span className="text-muted">({r.orders})</span></span><span className="font-semibold tabular-nums">{formatMoney(r.sales)}</span></div>
            <div className="mt-1 h-2 rounded-full bg-ink/5"><div className="h-2 rounded-full bg-brand" style={{ width: `${(Number(r.sales) / max) * 100}%` }} /></div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Weekday × hour grid of orders (darker = busier). */
function Heatmap({ cells }: { cells: Overview['heatmap'] }) {
  const { t, i18n } = useTranslation();
  const max = Math.max(1, ...cells.map((c) => c.orders));
  const at = (d: number, h: number) => cells.find((c) => c.day === d && c.hour === h)?.orders ?? 0;
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const days = [1, 2, 3, 4, 5, 6, 7];
  const dayName = (d: number) => new Intl.DateTimeFormat(intlLocale(i18n.language), { weekday: 'short' }).format(new Date(2026, 10, 1 + d)); // 2 Nov 2026 is a Monday
  return (
    <section className="card overflow-x-auto p-5">
      <h2 className="font-bold">{t('reports.peakHours')}</h2>
      <p className="text-sm text-muted">{t('reports.peakHint')}</p>
      <table className="mt-3 border-separate border-spacing-0.5 text-[10px]">
        <thead><tr><th />{hours.map((h) => <th key={h} className="w-6 font-normal text-muted">{h % 3 === 0 ? h : ''}</th>)}</tr></thead>
        <tbody>
          {days.map((d) => (
            <tr key={d}>
              <th className="pr-2 text-left font-semibold">{dayName(d)}</th>
              {hours.map((h) => {
                const n = at(d, h);
                return <td key={h} title={t('reports.cell', { day: dayName(d), hour: h, count: n })} className="h-6 w-6 rounded" style={{ background: n ? `rgb(194 65 12 / ${0.12 + (n / max) * 0.88})` : 'rgb(0 0 0 / 0.04)' }}><span className="sr-only">{n}</span></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const today = todayIn('Asia/Kolkata');
  const [range, setRange] = useState<{ from: string; to: string }>({ from: shiftDate(today, -29), to: today });
  const [by, setBy] = useState<'day' | 'week' | 'month'>('day');
  const q = useQuery({
    queryKey: ['reports', range, by],
    queryFn: async () => (await api.get<Overview>('/tenant/reports/overview', { ...range, by })).data,
    placeholderData: keepPreviousData,
  });
  const r = q.data;
  const chart = useMemo(() => (r?.series ?? []).map((s) => ({ ...s, sales: Number(s.sales), label: by === 'month' ? s.period : s.period.slice(5) })), [r, by]);
  const csv = (type: string) => void downloadFile(`/tenant/reports/export/${type}`, `${type}-${range.from}-to-${range.to}.csv`, { ...range, by }).catch((e: Error) => toast.error(e.message));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight"><LineChart className="h-7 w-7" aria-hidden="true" /> {t('reports.title')}</h1>
          <p className="text-muted">{t('reports.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((d) => (
            <button key={d} type="button" aria-pressed={range.from === shiftDate(today, -(d - 1)) && range.to === today} onClick={() => setRange({ from: shiftDate(today, -(d - 1)), to: today })} className="rounded-full border border-line px-3.5 py-1.5 text-sm font-semibold aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper">{t('reports.lastDays', { count: d })}</button>
          ))}
          <input type="date" className="field-input !w-auto !py-1.5" aria-label={t('reports.from')} max={range.to} value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} />
          <input type="date" className="field-input !w-auto !py-1.5" aria-label={t('reports.to')} min={range.from} max={today} value={range.to} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} />
        </div>
      </div>

      {q.isLoading && <SkeletonRows rows={6} />}
      {q.isError && <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />}
      {r && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label={t('reports.sales')} value={formatMoney(r.totals.sales)} hint={t('reports.gstIn', { value: formatMoney(r.totals.gst) })} />
            <Kpi label={t('reports.orders')} value={String(r.totals.orders)} hint={t('reports.cancelled', { count: r.totals.cancelled, value: formatMoney(r.totals.cancelled_value) })} />
            <Kpi label={t('reports.aov')} value={formatMoney(r.totals.average)} hint={t('reports.discounts', { value: formatMoney(r.totals.discounts) })} />
            <Kpi label={t('reports.repeat')} value={r.totals.repeat_rate === null ? '—' : `${r.totals.repeat_rate}%`} hint={t('reports.repeatHint', { repeat: r.totals.repeat_customers, total: r.totals.customers })} />
          </div>

          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">{t('reports.salesOverTime')}</h2>
              <div className="flex gap-1 rounded-full bg-ink/5 p-1" role="radiogroup" aria-label={t('reports.groupBy')}>
                {(['day', 'week', 'month'] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={by === k} onClick={() => setBy(k)} className={`rounded-full px-3 py-1 text-sm font-semibold ${by === k ? 'bg-surface shadow' : 'text-muted'}`}>{t(`reports.by.${k}`)}</button>)}
              </div>
            </div>
            <div className="mt-4 h-64" role="img" aria-label={t('reports.chartLabel', { from: r.from, to: r.to, value: formatMoney(r.totals.sales) })}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(0 0 0 / 0.08)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v: number) => formatMoney(v)} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} labelFormatter={(l: string) => l} />
                  <Bar dataKey="sales" name={t('reports.sales')} fill="#c2410c" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(['sales', 'orders', 'dishes', 'categories', 'customers', 'reservations', ...(r.hotel ? (['stays'] as const) : [])] as const).map((k) => (
                <button key={k} type="button" className="btn-outline !min-h-9 text-xs" onClick={() => csv(k)}><Download className="h-3.5 w-3.5" aria-hidden="true" /> {t(`reports.csv.${k}`)}</button>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Bars title={t('reports.byType')} rows={r.by_type} label={(k) => t(`order.type.${k}`)} />
            <Bars title={t('reports.byPayment')} rows={r.by_payment} label={(k) => t(`order.pay.${k}`)} />
            <Bars title={t('reports.bySource')} rows={r.by_source} label={(k) => t(`pos.source.${k}`)} />
          </div>

          <Heatmap cells={r.heatmap} />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <section className="card p-5">
              <h2 className="font-bold">{t('reports.top')}</h2>
              <ol className="mt-3 space-y-1.5 text-sm">
                {r.dishes.top.length === 0 && <li className="text-muted">—</li>}
                {r.dishes.top.map((d, i) => <li key={d.name} className="flex justify-between gap-2"><span><span className="mr-2 text-muted">{i + 1}.</span>{d.name} <span className="text-muted">× {d.quantity}</span></span><span className="tabular-nums">{formatMoney(d.sales)}</span></li>)}
              </ol>
            </section>
            <section className="card p-5">
              <h2 className="font-bold">{t('reports.slow')}</h2>
              <p className="text-xs text-muted">{t('reports.slowHint')}</p>
              <ol className="mt-3 space-y-1.5 text-sm">
                {r.dishes.slow.map((d) => <li key={d.name} className="flex justify-between gap-2"><span>{d.name} <span className="text-muted">· {d.category}</span></span><span className="tabular-nums">{d.quantity}</span></li>)}
              </ol>
            </section>
            <section className="card p-5">
              <h2 className="font-bold">{t('reports.categories')}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {r.categories.map((c) => (
                  <li key={c.category}>
                    <div className="flex justify-between"><span>{c.category}</span><span className="tabular-nums">{formatMoney(c.sales)} · {c.share}%</span></div>
                    <div className="mt-1 h-2 rounded-full bg-ink/5"><div className="h-2 rounded-full bg-gold" style={{ width: `${c.share}%` }} /></div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className="card p-5">
              <h2 className="font-bold">{t('reports.bookings')}</h2>
              <p className="mt-2 text-sm">{t('reports.bookingsLine', { bookings: r.reservations.bookings, guests: r.reservations.guests })}{r.reservations.no_show_rate !== null && ` · ${t('reports.noShow', { rate: r.reservations.no_show_rate })}`}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">{r.reservations.by_status.map((s) => <span key={s.key} className="rounded-full bg-ink/5 px-2.5 py-1">{t(`site.res.status.${s.key}`)}: {s.count}</span>)}</div>
            </section>
            <section className="card p-5">
              <h2 className="font-bold">{t('reports.offers')}</h2>
              <p className="mt-2 text-sm">{t('reports.offersLine', { uses: r.offers.coupon_uses, value: formatMoney(r.offers.coupon_discount), earned: r.offers.points_earned, redeemed: r.offers.points_redeemed })}</p>
            </section>
          </div>

          {r.hotel && (
            <section className="card space-y-4 p-5" aria-labelledby="rooms-h">
              <h2 id="rooms-h" className="font-bold">{t('reports.rooms')}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Kpi label={t('reports.occupancy')} value={`${r.hotel.occupancy}%`} hint={t('reports.nightsSold', { sold: r.hotel.nights_sold, available: r.hotel.nights_available })} />
                <Kpi label={t('reports.roomRevenue')} value={formatMoney(r.hotel.room_revenue)} hint={t('reports.beforeGst')} />
                <Kpi label={t('reports.adr')} value={formatMoney(r.hotel.adr)} hint={t('reports.adrHint')} />
                <Kpi label={t('reports.revpar')} value={formatMoney(r.hotel.revpar)} hint={t('reports.revparHint')} />
              </div>
              <p className="text-sm">{t('reports.staysLine', { stays: r.hotel.stays, nights: r.hotel.average_nights ?? 0, cancelled: r.hotel.cancelled, noShows: r.hotel.no_shows })}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {r.hotel.by_type.map((x) => <span key={x.key} className="rounded-full bg-ink/5 px-2.5 py-1">{x.key}: {t('reports.typeNights', { count: x.nights })}</span>)}
                {r.hotel.by_source.map((x) => <span key={x.key} className="rounded-full bg-brand-soft px-2.5 py-1">{t(`hotel.source.${x.key}`)}: {x.count}</span>)}
              </div>
              {r.hotel.rooms > 0 && (
                <div className="flex h-24 items-end gap-0.5" role="img" aria-label={t('reports.occupancyChart', { value: r.hotel.occupancy })}>
                  {r.hotel.series.map((d) => <div key={d.date} title={`${d.date}: ${d.occupancy}%`} className="flex-1 rounded-t bg-brand/70" style={{ height: `${Math.max(2, d.occupancy)}%` }} />)}
                </div>
              )}
              <p className="text-xs text-muted">{t('reports.roomsNote')}</p>
            </section>
          )}
        </>
      )}
      <GstPanel />
    </div>
  );
}
