import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart3, Minus, Plus, ReceiptText, Send, ShoppingBag, Trash2, UtensilsCrossed } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatMoney as formatINR } from '@/lib/format';
import { useCan, useFeature } from '@/hooks/useSession';
import { Alert, Badge, EmptyState, ErrorState, SkeletonRows, Spinner, toast } from '@/components/ui';
import { FoodTypeMark } from '@/site/components/bits';
import { useLiveTables } from '@/features/tables/api';
import { MenuPicker } from './MenuPicker';
import { BillDialog, type BillTarget } from './BillDialog';
import { useOpenBills, usePosMenu, type TicketLine } from './api';

function useAgo() {
  const { t } = useTranslation();
  return (iso: string) => t('orders.minutesAgo', { count: Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) });
}

/** The order being built: lines, table / takeaway, then send to the kitchen or charge now. */
function Ticket({ lines, setLines, onBill }: { lines: TicketLine[]; setLines: (l: TicketLine[]) => void; onBill: (t: BillTarget) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const hasTables = useFeature('qr_ordering');
  const tables = useLiveTables(hasTables);
  const [type, setType] = useState<'takeaway' | 'dine_in'>('takeaway');
  const [tableId, setTableId] = useState<number | ''>('');
  const [customer, setCustomer] = useState({ name: '', phone: '' });
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const subtotal = lines.reduce((n, l) => n + l.unit * l.quantity, 0);
  const count = lines.reduce((n, l) => n + l.quantity, 0);

  const place = useMutation<{ data: { id: number; number: number } }, ApiError, 'kot' | 'charge'>({
    mutationFn: () =>
      api.post('/tenant/pos/orders', {
        type,
        source: 'pos',
        dining_table_id: type === 'dine_in' ? tableId || null : null,
        customer: customer.name || customer.phone ? { name: customer.name || null, phone: customer.phone || null } : null,
        notes: notes || null,
        items: lines.map((l) => ({ item_id: l.item_id, variant_id: l.variant_id, addon_ids: l.addon_ids, quantity: l.quantity, notes: l.notes || null })),
      }),
    onSuccess: (res, mode) => {
      toast.success(t('pos.sent', { number: res.data.number }));
      setLines([]);
      setNotes('');
      setCustomer({ name: '', phone: '' });
      setError('');
      for (const k of ['pos-open', 'tables-live', 'orders']) void qc.invalidateQueries({ queryKey: [k] });
      if (mode === 'charge') onBill({ title: t('pos.billFor', { number: res.data.number }), orderIds: [res.data.id] });
    },
    onError: (e) => setError(e.errors ? Object.values(e.errors)[0][0] : e.message),
  });
  const qty = (key: string, d: number) => setLines(lines.flatMap((l) => (l.key === key ? (l.quantity + d <= 0 ? [] : [{ ...l, quantity: Math.min(50, l.quantity + d) }]) : [l])));
  const freeTables = (tables.data ?? []).filter((x) => x.is_active);

  return (
    <div className="card flex flex-col gap-4 p-4">
      <div className="flex gap-1 rounded-full bg-ink/5 p-1" role="radiogroup" aria-label={t('order.howTitle')}>
        {(['takeaway', 'dine_in'] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={type === k} onClick={() => setType(k)} disabled={k === 'dine_in' && !hasTables} className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold disabled:opacity-40 ${type === k ? 'bg-surface shadow' : 'text-muted'}`}>
            {k === 'takeaway' ? <ShoppingBag className="h-4 w-4" aria-hidden="true" /> : <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />}
            {t(`order.type.${k}`)}
          </button>
        ))}
      </div>
      {type === 'dine_in' && (
        <label>
          <span className="field-label">{t('reservationsAdmin.table')}</span>
          <select className="field-input" value={tableId} onChange={(e) => setTableId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">{t('pos.chooseTable')}</option>
            {freeTables.map((tb) => (
              <option key={tb.id} value={tb.id}>
                {tb.label} · {t(`tablesAdmin.state.${tb.state}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <input className="field-input !py-2" placeholder={t('pos.customerName')} aria-label={t('pos.customerName')} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
        <input className="field-input !py-2" type="tel" placeholder={t('pos.customerPhone')} aria-label={t('pos.customerPhone')} value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
      </div>

      {lines.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t('pos.empty')}</p>
      ) : (
        <ul className="max-h-[40vh] divide-y divide-line overflow-y-auto">
          {lines.map((l) => (
            <li key={l.key} className="flex items-center gap-2 py-2">
              <FoodTypeMark type={l.food_type} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{l.name}</span>
                {(l.detail || l.notes) && <span className="block truncate text-xs text-muted">{[l.detail, l.notes && `“${l.notes}”`].filter(Boolean).join(' · ')}</span>}
              </span>
              <span className="flex items-center rounded-full border border-line">
                <button type="button" className="flex h-8 w-8 items-center justify-center" onClick={() => qty(l.key, -1)} aria-label={l.quantity === 1 ? t('order.removeNamed', { name: l.name }) : t('order.decrease', { name: l.name })}>
                  {l.quantity === 1 ? <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Minus className="h-3.5 w-3.5" aria-hidden="true" />}
                </button>
                <span className="w-6 text-center text-sm font-bold tabular-nums">{l.quantity}</span>
                <button type="button" className="flex h-8 w-8 items-center justify-center" onClick={() => qty(l.key, 1)} aria-label={t('order.increase', { name: l.name })}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
              <span className="w-16 text-right text-sm tabular-nums">{formatINR(l.unit * l.quantity)}</span>
            </li>
          ))}
        </ul>
      )}
      <input className="field-input !py-2" placeholder={t('pos.kitchenNote')} aria-label={t('pos.kitchenNote')} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted">{t('pos.itemsCount', { count })}</span>
        <span className="text-xl font-extrabold tabular-nums">{formatINR(subtotal)}</span>
      </div>
      <p className="-mt-3 text-right text-xs text-muted">{t('pos.gstOnBill')}</p>
      {error && <Alert>{error}</Alert>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-outline" disabled={!lines.length || place.isPending || (type === 'dine_in' && !tableId)} onClick={() => place.mutate('kot')}>
          <Send className="h-4 w-4" aria-hidden="true" /> {t('pos.sendKot')}
        </button>
        <button type="button" className="btn-primary" disabled={!lines.length || place.isPending || type === 'dine_in'} onClick={() => place.mutate('charge')} title={type === 'dine_in' ? t('pos.chargeTableHint') : undefined}>
          {place.isPending ? <Spinner /> : t('pos.charge')}
        </button>
      </div>
    </div>
  );
}

function OpenBillsList({ onBill }: { onBill: (t: BillTarget) => void }) {
  const { t } = useTranslation();
  const ago = useAgo();
  const open = useOpenBills();
  if (open.isLoading) return <SkeletonRows rows={4} />;
  if (open.isError) return <ErrorState message={(open.error as Error).message} onRetry={() => void open.refetch()} />;
  const d = open.data!;
  if (!d.tables.length && !d.orders.length && !d.bills.length) return <EmptyState title={t('pos.nothingOpen')}>{t('pos.nothingOpenHint')}</EmptyState>;
  return (
    <div className="space-y-6">
      {d.tables.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">{t('pos.openTables')}</h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {d.tables.map((s) => (
              <li key={s.session_id}>
                <button type="button" onClick={() => onBill({ title: t('pos.billForTable', { table: s.table }), sessionId: s.invoice ? undefined : s.session_id, invoiceId: s.invoice?.id })} className={`card w-full p-4 text-left hover:border-ink ${s.bill_requested ? '!border-warn ring-2 ring-warn/25' : ''}`}>
                  <span className="flex items-center justify-between">
                    <span className="text-xl font-extrabold">{s.table}</span>
                    <span className="text-lg font-bold tabular-nums">{formatINR(s.invoice?.due ?? s.total)}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1.5 text-sm text-muted">
                    {t('pos.ordersN', { count: s.orders })} · {ago(s.opened_at)}
                    {s.bill_requested && <Badge tone="pending">{t('tablesAdmin.state.bill_requested')}</Badge>}
                    {s.invoice && <Badge tone="confirmed">{s.invoice.number}</Badge>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {d.orders.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">{t('pos.unbilledOrders')}</h2>
          <ul className="card divide-y divide-line">
            {d.orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className="font-extrabold tabular-nums">#{o.number}</span>
                <span className="text-sm">{o.customer_name}</span>
                <Badge tone={o.status}>{t(`order.status.${o.status}`)}</Badge>
                <span className="text-xs text-muted">
                  {t(`order.type.${o.type}`)} · {t(`pos.source.${o.source}`)} · {ago(o.placed_at)}
                </span>
                <span className="ml-auto font-bold tabular-nums">{formatINR(o.total)}</span>
                <button type="button" className="btn-primary !min-h-9 text-sm" onClick={() => onBill({ title: t('pos.billFor', { number: o.number }), orderIds: [o.id] })}>
                  {t('pos.bill')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {d.bills.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">{t('pos.unpaidBills')}</h2>
          <ul className="flex flex-wrap gap-2">
            {d.bills.map((b) => (
              <li key={b.id}>
                <button type="button" className="btn-outline !min-h-10 text-sm" onClick={() => onBill({ title: b.number, invoiceId: b.id })}>
                  {b.number} · {formatINR(b.due)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function PosPage() {
  const { t } = useTranslation();
  const menu = usePosMenu();
  const canPos = useCan('pos.use');
  const open = useOpenBills(canPos);
  const [tab, setTab] = useState<'new' | 'open'>('new');
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [billing, setBilling] = useState<BillTarget | null>(null);
  const add = (l: TicketLine) => {
    const found = lines.find((x) => x.key === l.key);
    setLines(found ? lines.map((x) => (x.key === l.key ? { ...x, quantity: Math.min(50, x.quantity + l.quantity) } : x)) : [...lines, l]);
  };
  const openCount = (open.data?.tables.length ?? 0) + (open.data?.orders.length ?? 0) + (open.data?.bills.length ?? 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <ReceiptText className="h-7 w-7" aria-hidden="true" />
            {t('pos.title')}
          </h1>
          <p className="text-muted">{t('pos.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full bg-ink/5 p-1" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'new'} onClick={() => setTab('new')} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === 'new' ? 'bg-surface shadow' : 'text-muted'}`}>
              {t('pos.newOrder')}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'open'} onClick={() => setTab('open')} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === 'open' ? 'bg-surface shadow' : 'text-muted'}`}>
              {t('pos.openBills')} {openCount > 0 && <span className="ml-1 rounded-full bg-brand px-1.5 text-xs text-white">{openCount}</span>}
            </button>
          </div>
          <Link to="/dashboard/day-end" className="btn-ghost !min-h-10 text-sm">
            <BarChart3 className="h-4 w-4" aria-hidden="true" /> {t('pos.dayEnd')}
          </Link>
        </div>
      </div>

      {tab === 'new' ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
          <div>{menu.isLoading ? <SkeletonRows rows={6} /> : menu.data ? <MenuPicker menu={menu.data} onAdd={add} /> : <ErrorState message={(menu.error as Error | null)?.message} onRetry={() => void menu.refetch()} />}</div>
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Ticket lines={lines} setLines={setLines} onBill={setBilling} />
          </div>
        </div>
      ) : (
        <OpenBillsList onBill={setBilling} />
      )}
      <BillDialog target={billing} onClose={() => setBilling(null)} />
    </div>
  );
}
