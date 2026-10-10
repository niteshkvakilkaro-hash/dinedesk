import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart3, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { api, ApiError, downloadFile } from '@/lib/api';
import { formatMoney as formatINR } from '@/lib/format';
import { Alert, Badge, ErrorState, Field, SkeletonRows, Spinner, toast } from '@/components/ui';
import { shiftDate, todayIn } from '@/features/reservations/api';
import { BillDialog, type BillTarget } from './BillDialog';

interface Report {
  date: string;
  bills: { count: number; first: string | null; last: string | null; voided: number; items_total: string; discount: string; taxable_value: string; cgst: string; sgst: string; charges: string; round_off: string; total: string; unpaid: number };
  payments: { mode: string; count: number; amount: string }[];
  outside_bills: { method: string; count: number; amount: string }[];
  orders: { count: number; value: string; average: string; by_type: { key: string; count: number; amount: string }[]; by_source: { key: string; count: number; amount: string }[]; cancelled: { count: number; amount: string } };
  top_items: { name: string; quantity: number; amount: string }[];
  open: { tables: number; unbilled_orders: number; unpaid_bills: number };
  cash: { opening: string; from_bills: string; outside_bills: string; gift_cards?: string; hotel?: string; expected: string };
  gift_cards_sold?: { mode: string; count: number; amount: string }[];
  hotel?: { by_mode: { mode: string; count: number; amount: string }[]; advances: string; refunds: string; net: string };
  closing: { opening_cash: string; counted_cash: string; expected_cash: string; difference: string; notes: string | null; closed_at: string } | null;
  recent_closings: { date: string; counted: string; expected: string; difference: string }[];
}

interface BillRow { id: number; number: string; status: 'unpaid' | 'paid' | 'void'; total: string; paid: string; discount: string; issued_at: string; modes: string[] }

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default function DayEndPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const today = todayIn('Asia/Kolkata');
  const [date, setDate] = useState(today);
  const [opening, setOpening] = useState('');
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [bill, setBill] = useState<BillTarget | null>(null);
  const report = useQuery({
    queryKey: ['day-report', date, opening],
    queryFn: async () => (await api.get<Report>('/tenant/reports/day', { date, opening_cash: opening === '' ? undefined : Number(opening) })).data,
    placeholderData: (prev) => prev,
  });
  const bills = useQuery({ queryKey: ['bills', date], queryFn: async () => (await api.get<BillRow[]>('/tenant/bills', { date })).data });
  const r = report.data;
  useEffect(() => {
    if (r?.closing && opening === '') setOpening(String(Number(r.closing.opening_cash)));
  }, [r?.closing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setOpening('');
    setCounted('');
    setNotes('');
  }, [date]);

  const close = useMutation<unknown, ApiError>({
    mutationFn: () => api.post('/tenant/reports/day/close', { date, opening_cash: Number(opening) || 0, counted_cash: Number(counted) || 0, notes: notes || null }),
    onSuccess: () => {
      toast.success(t('dayEnd.closedToast'));
      void qc.invalidateQueries({ queryKey: ['day-report'] });
    },
    onError: (e) => toast.error(e.message),
  });
  const diff = r && counted !== '' ? Number(counted) - Number(r.cash.expected) : null;
  const label = new Intl.DateTimeFormat(i18n.language.startsWith('hi') ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <BarChart3 className="h-7 w-7" aria-hidden="true" />
            {t('dayEnd.title')}
          </h1>
          <p className="text-muted">{label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost !min-h-10 !px-2" onClick={() => setDate(shiftDate(date, -1))} aria-label={t('common.previous')}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <input type="date" className="field-input !w-auto !py-2" max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label={t('site.res.date')} />
          <button type="button" className="btn-ghost !min-h-10 !px-2" onClick={() => setDate(shiftDate(date, 1))} disabled={date >= today} aria-label={t('common.next')}>
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" className="btn-outline !min-h-10 text-sm" onClick={() => void downloadFile('/tenant/reports/day/pdf', `day-end-${date}.pdf`, { date }).catch((e: Error) => toast.error(e.message))}>
            <Download className="h-4 w-4" aria-hidden="true" /> PDF
          </button>
        </div>
      </div>

      {report.isLoading && <SkeletonRows rows={6} />}
      {report.isError && <ErrorState message={(report.error as Error).message} onRetry={() => void report.refetch()} />}
      {r && (
        <>
          {(r.open.tables > 0 || r.open.unbilled_orders > 0 || r.open.unpaid_bills > 0) && (
            <Alert tone="warn">{t('dayEnd.stillOpen', { tables: r.open.tables, orders: r.open.unbilled_orders, bills: r.open.unpaid_bills })}</Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t('dayEnd.billed')} value={formatINR(r.bills.total)} hint={r.bills.count ? t('dayEnd.billsRange', { count: r.bills.count, first: r.bills.first, last: r.bills.last }) : t('dayEnd.noBills')} />
            <Stat label={t('dayEnd.gst')} value={formatINR(Number(r.bills.cgst) + Number(r.bills.sgst))} hint={`CGST ${formatINR(r.bills.cgst)} · SGST ${formatINR(r.bills.sgst)}`} />
            <Stat label={t('dayEnd.orders')} value={String(r.orders.count)} hint={t('dayEnd.avg', { amount: formatINR(r.orders.average) })} />
            <Stat label={t('dayEnd.discounts')} value={formatINR(r.bills.discount)} hint={t('dayEnd.cancelled', { count: r.orders.cancelled.count, amount: formatINR(r.orders.cancelled.amount) })} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card p-5">
              <h2 className="font-bold">{t('dayEnd.payments')}</h2>
              <dl className="mt-3 space-y-1.5 text-sm">
                {r.payments.length === 0 && <p className="text-muted">{t('dayEnd.noPayments')}</p>}
                {r.payments.map((p) => (
                  <div key={p.mode} className="flex justify-between">
                    <dt>
                      {t(`pos.mode.${p.mode}`)} <span className="text-muted">({p.count})</span>
                    </dt>
                    <dd className="font-semibold tabular-nums">{formatINR(p.amount)}</dd>
                  </div>
                ))}
                {r.outside_bills.map((p) => (
                  <div key={p.method} className="flex justify-between text-muted">
                    <dt>
                      {t(`dayEnd.outside.${p.method}`)} ({p.count})
                    </dt>
                    <dd className="tabular-nums">{formatINR(p.amount)}</dd>
                  </div>
                ))}
              </dl>
              {!!r.hotel?.by_mode.length && (
                <>
                  <h3 className="mt-5 font-bold">{t('dayEnd.hotel')}</h3>
                  <dl className="mt-2 space-y-1 text-sm">
                    {r.hotel.by_mode.map((p) => (
                      <div key={p.mode} className="flex justify-between">
                        <dt>{t(`hotel.mode.${p.mode}`)} <span className="text-muted">({p.count})</span></dt>
                        <dd className="font-semibold tabular-nums">{formatINR(p.amount)}</dd>
                      </div>
                    ))}
                    {Number(r.hotel.refunds) > 0 && <p className="text-muted">{t('dayEnd.hotelRefunds', { amount: formatINR(r.hotel.refunds) })}</p>}
                    <p className="text-xs text-muted">{t('dayEnd.hotelHint')}</p>
                  </dl>
                </>
              )}
              <h3 className="mt-5 font-bold">{t('dayEnd.byType')}</h3>
              <dl className="mt-2 space-y-1 text-sm">
                {r.orders.by_type.map((x) => (
                  <div key={x.key} className="flex justify-between">
                    <dt>{t(`order.type.${x.key}`)} ({x.count})</dt>
                    <dd className="tabular-nums">{formatINR(x.amount)}</dd>
                  </div>
                ))}
                {r.orders.by_source.map((x) => (
                  <div key={x.key} className="flex justify-between text-muted">
                    <dt>{t(`pos.source.${x.key}`)} ({x.count})</dt>
                    <dd className="tabular-nums">{formatINR(x.amount)}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="card p-5">
              <h2 className="font-bold">{t('dayEnd.cashDrawer')}</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label={t('dayEnd.opening')}>{(a) => <input {...a} type="number" min={0} inputMode="decimal" className="field-input" value={opening} onChange={(e) => setOpening(e.target.value)} />}</Field>
                <Field label={t('dayEnd.counted')}>{(a) => <input {...a} type="number" min={0} inputMode="decimal" className="field-input" value={counted} onChange={(e) => setCounted(e.target.value)} />}</Field>
              </div>
              <dl className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between"><dt>{t('dayEnd.cashBills')}</dt><dd className="tabular-nums">{formatINR(r.cash.from_bills)}</dd></div>
                <div className="flex justify-between"><dt>{t('dayEnd.cashOutside')}</dt><dd className="tabular-nums">{formatINR(r.cash.outside_bills)}</dd></div>
                {Number(r.cash.gift_cards ?? 0) > 0 && <div className="flex justify-between"><dt>{t('dayEnd.cashGiftCards')}</dt><dd className="tabular-nums">{formatINR(r.cash.gift_cards!)}</dd></div>}
                {Number(r.cash.hotel ?? 0) !== 0 && <div className="flex justify-between"><dt>{t('dayEnd.cashHotel')}</dt><dd className="tabular-nums">{formatINR(r.cash.hotel!)}</dd></div>}
                <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>{t('dayEnd.expected')}</dt><dd className="tabular-nums">{formatINR(r.cash.expected)}</dd></div>
                {diff !== null && (
                  <div className={`flex justify-between font-bold ${Math.abs(diff) < 0.005 ? 'text-success' : 'text-danger'}`}>
                    <dt>{t('dayEnd.difference')}</dt>
                    <dd className="tabular-nums">{diff > 0 ? '+' : diff < 0 ? '−' : ''}{formatINR(Math.abs(diff))}</dd>
                  </div>
                )}
              </dl>
              <input className="field-input mt-4" placeholder={t('dayEnd.notes')} aria-label={t('dayEnd.notes')} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <button type="button" className="btn-primary mt-3 w-full" disabled={counted === '' || close.isPending} onClick={() => close.mutate()}>
                {close.isPending ? <Spinner /> : r.closing ? t('dayEnd.closeAgain') : t('dayEnd.close')}
              </button>
              {r.closing && (
                <p className="mt-2 text-sm text-muted">
                  {t('dayEnd.closedAt', { time: new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(r.closing.closed_at)), counted: formatINR(r.closing.counted_cash), diff: formatINR(r.closing.difference) })}
                </p>
              )}
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card p-5">
              <h2 className="font-bold">{t('dayEnd.topDishes')}</h2>
              <ol className="mt-3 space-y-1.5 text-sm">
                {r.top_items.length === 0 && <li className="text-muted">{t('dayEnd.noOrders')}</li>}
                {r.top_items.map((i, n) => (
                  <li key={i.name} className="flex justify-between gap-3">
                    <span>
                      <span className="mr-2 text-muted tabular-nums">{n + 1}.</span>
                      {i.name} <span className="text-muted">× {i.quantity}</span>
                    </span>
                    <span className="tabular-nums">{formatINR(i.amount)}</span>
                  </li>
                ))}
              </ol>
            </section>
            <section className="card p-5">
              <h2 className="font-bold">{t('dayEnd.billsList')}</h2>
              <ul className="mt-3 max-h-72 divide-y divide-line overflow-y-auto text-sm">
                {(bills.data ?? []).length === 0 && <li className="py-2 text-muted">{t('dayEnd.noBills')}</li>}
                {(bills.data ?? []).map((b) => (
                  <li key={b.id}>
                    <button type="button" className="flex w-full items-center gap-2 py-2 text-left hover:underline" onClick={() => setBill({ title: b.number, invoiceId: b.id })}>
                      <span className="font-mono">{b.number}</span>
                      <Badge tone={b.status === 'paid' ? 'paid' : b.status === 'void' ? 'cancelled' : 'pending'}>{t(`pos.status.${b.status}`)}</Badge>
                      <span className="text-xs text-muted">{b.modes.map((m) => t(`pos.mode.${m}`)).join(' + ')}</span>
                      <span className="ml-auto font-semibold tabular-nums">{formatINR(b.total)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
      <BillDialog target={bill} onClose={() => setBill(null)} />
    </div>
  );
}
