import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOpenParam } from '@/lib/urlParams';
import { BedDouble, Bell, BellOff, Bike, Clock, MapPin, Phone, RefreshCw, Search, ShoppingBag, Store, UtensilsCrossed } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatINR } from '@/lib/format';
import { useCan, useFeature, useSession } from '@/hooks/useSession';
import { Link } from 'react-router';
import { useRiders } from '@/features/riders/api';
import { RiderPicker } from '@/features/riders/RiderPicker';
import { useDebounced } from '@/hooks/useDebounced';
import { Alert, Badge, Dialog, EmptyState, ErrorState, Field, SkeletonRows, Spinner, toast } from '@/components/ui';
import type { OrderStatus, OrderType } from '@/site/types';
import { playChime, useAlertPrefs, type OrderFeed } from './alerts';

interface OrderRow {
  id: number;
  public_id: string;
  number: number;
  type: OrderType;
  status: OrderStatus;
  customer_name: string;
  customer_phone: string;
  items_count: number;
  total: string;
  payment_method: 'online' | 'cod' | 'counter' | 'room' | 'upi';
  payment_status: string;
  payment_reference?: string | null;
  scheduled_for: string | null;
  placed_at: string;
  table_label: string | null;
  rider_name?: string | null;
}

interface OrderDetail extends OrderRow {
  internal_id: number;
  customer_email: string | null;
  address_full: { line1: string | null; line2: string | null; landmark: string | null; pincode: string | null; lat: number | null; lng: number | null } | null;
  notes: string | null;
  items: { name: string; variant_name: string | null; addons: { name: string; price: string }[]; food_type: string; unit_price: string; quantity: number; line_total: string; notes: string | null }[];
  subtotal: string;
  tax_total: string;
  delivery_fee: string;
  packaging_fee: string;
  cancel_reason: string | null;
  events: { status: string; note: string | null; at: string }[];
  next: OrderStatus[];
  rider: { id: number; name: string | null; assigned_at: string | null } | null;
}

type View = 'active' | 'scheduled' | 'completed' | 'cancelled' | 'all';
const TYPE_ICON = { delivery: Bike, takeaway: ShoppingBag, dine_in: UtensilsCrossed, room_service: BedDouble } as const;

function useTimeAgo() {
  const { t } = useTranslation();
  return (iso: string) => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return t('orders.justNow');
    if (mins < 60) return t('orders.minutesAgo', { count: mins });
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(iso));
  };
}

function useTransition(onDone?: () => void) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation<OrderDetail, ApiError, { id: number; status: OrderStatus; note?: string }>({
    mutationFn: async ({ id, status, note }) => (await api.post<OrderDetail>(`/tenant/orders/${id}/status`, { status, note })).data,
    onSuccess: (order) => {
      toast.success(t('orders.moved', { number: order.number, status: t(`order.status.${order.status}`) }));
      qc.setQueryData(['order-detail', order.internal_id], order);
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['orders-feed'] });
      onDone?.();
    },
    onError: (e) => toast.error(e.message),
  });
}

function NextButton({ order, onCancel }: { order: { internal_id?: number; id: number; next?: OrderStatus[]; status: OrderStatus; type: OrderType; payment_method: string; payment_status: string }; onCancel: () => void }) {
  const { t } = useTranslation();
  const canManage = useCan('orders.manage');
  const move = useTransition();
  if (!canManage) return null;
  const next = order.next ?? defaultNext(order.status, order.type);
  const forward = next.filter((s) => s !== 'cancelled');
  const id = order.internal_id ?? order.id;
  const unpaidOnline = order.payment_method === 'online' && order.payment_status !== 'paid';
  return (
    <div className="flex flex-wrap gap-2">
      {forward.map((s) => (
        <button key={s} type="button" className="btn-brand !min-h-10 !px-4 text-sm" disabled={move.isPending || unpaidOnline} onClick={() => move.mutate({ id, status: s })}>
          {move.isPending ? <Spinner className="h-4 w-4" /> : t(`orders.action.${s}`)}
        </button>
      ))}
      {next.includes('cancelled') && (
        <button type="button" className="btn-ghost !min-h-10 !px-3 text-sm text-danger" onClick={onCancel}>
          {t('orders.cancel')}
        </button>
      )}
    </div>
  );
}

function defaultNext(status: OrderStatus, type: OrderType): OrderStatus[] {
  const map: Record<OrderStatus, OrderStatus[]> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready: type === 'delivery' ? ['out_for_delivery', 'cancelled'] : ['completed', 'cancelled'],
    out_for_delivery: ['completed'],
    completed: [],
    cancelled: [],
  };
  return map[status];
}

function CancelDialog({ order, onClose }: { order: { id: number; number: number } | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const move = useTransition(onClose);
  const reasons = [t('orders.reasons.itemOut'), t('orders.reasons.closing'), t('orders.reasons.tooBusy'), t('orders.reasons.customer')];
  return (
    <Dialog open={!!order} onClose={onClose} title={t('orders.cancelTitle', { number: order?.number })}>
      <p className="text-sm text-muted">{t('orders.cancelHint')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {reasons.map((r) => (
          <button key={r} type="button" onClick={() => setReason(r)} className={`min-h-10 rounded-full border px-3 text-sm ${reason === r ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
            {r}
          </button>
        ))}
      </div>
      <Field label={t('orders.reason')} className="mt-4">
        {(a) => <input {...a} className="field-input" value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} />}
      </Field>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-outline" onClick={onClose}>
          {t('common.back')}
        </button>
        <button type="button" className="btn bg-danger text-white hover:bg-danger/90" disabled={reason.trim().length < 3 || move.isPending} onClick={() => order && move.mutate({ id: order.id, status: 'cancelled', note: reason.trim() })}>
          {move.isPending ? <Spinner /> : t('orders.confirmCancel')}
        </button>
      </div>
    </Dialog>
  );
}

/** A UPI payment to the restaurant's own UPI ID: staff check their UPI / bank app, then confirm. */
function UpiCheck({ order }: { order: OrderDetail }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canManage = useCan('orders.manage');
  const confirm = useMutation<unknown, ApiError>({
    mutationFn: () => api.post(`/tenant/orders/${order.internal_id}/upi-received`),
    onSuccess: () => {
      toast.success(t('orders.upiConfirmed'));
      for (const k of ['order-detail', 'orders']) void qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-warn-soft p-4 text-warn">
      <p className="min-w-0 flex-1 text-sm font-semibold">
        {order.payment_reference ? t('orders.upiWithRef', { amount: formatINR(order.total), reference: order.payment_reference }) : t('orders.upiNoRef', { amount: formatINR(order.total) })}
      </p>
      {canManage && (
        <button type="button" className="btn-primary !min-h-10 text-sm" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
          {confirm.isPending ? <Spinner /> : t('orders.upiReceived')}
        </button>
      )}
    </div>
  );
}

/** Delivery orders: who takes it. Those who move orders on can give it to a rider or take it back. */
function RiderSection({ order }: { order: OrderDetail }) {
  const { t } = useTranslation();
  const canManage = useCan('orders.manage');
  const hasOrdering = useFeature('online_ordering');
  const active = !['completed', 'cancelled'].includes(order.status);
  const riders = useRiders(canManage && hasOrdering && active);
  if (!order.rider && (!canManage || !active)) return null;
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-4">
      <Bike className="h-5 w-5 text-muted" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold">{t('riders.rider')}</h3>
        <p className="text-sm text-muted">{order.rider?.name ?? t('riders.none')}</p>
      </div>
      {canManage && active && (riders.data ? (
        riders.data.riders.length ? <RiderPicker orderId={order.internal_id} number={order.number} riders={riders.data.riders} current={order.rider?.id ?? null} /> : <Link to="/dashboard/riders" className="text-sm font-semibold text-brand-strong underline">{t('riders.noRiders')}</Link>
      ) : riders.isLoading ? <Spinner className="h-4 w-4" /> : null)}
    </section>
  );
}

function OrderDetailDialog({ id, onClose, onCancel }: { id: number | null; onClose: () => void; onCancel: (o: { id: number; number: number }) => void }) {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ['order-detail', id], queryFn: async () => (await api.get<OrderDetail>(`/tenant/orders/${id}`)).data, enabled: !!id, refetchInterval: 15_000 });
  const o = query.data;
  const when = (iso: string) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(iso));
  const a = o?.address_full;
  return (
    <Dialog open={!!id} onClose={onClose} title={o ? t('orders.orderTitle', { number: o.number }) : t('common.loading')} wide>
      {!o ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={o.status}>{t(`order.status.${o.status}`)}</Badge>
            <Badge tone="neutral">{t(`order.type.${o.type}`)}</Badge>
            <Badge tone={o.payment_status}>
              {t(`order.payShort.${o.payment_method}`)} · {t(`order.paymentStatus.${o.payment_status}`)}
            </Badge>
            {o.scheduled_for && (
              <Badge tone="pending">
                <Clock className="mr-1 h-3 w-3" aria-hidden="true" />
                {t('orders.forTime', { time: when(o.scheduled_for) })}
              </Badge>
            )}
          </div>
          {o.payment_method === 'online' && o.payment_status !== 'paid' && o.status !== 'cancelled' && <Alert tone="warn">{t('orders.awaitingPayment')}</Alert>}
          {o.payment_status === 'refund_due' && <Alert tone="danger">{t('orders.refundDue')}</Alert>}
          {o.payment_method === 'upi' && ['unpaid', 'pending'].includes(o.payment_status) && o.status !== 'cancelled' && <UpiCheck order={o} />}

          <section className="grid grid-cols-1 gap-3 rounded-xl bg-paper p-4 sm:grid-cols-2">
            <div>
              <p className="font-semibold">{o.customer_name}</p>
              <a href={`tel:${o.customer_phone}`} className="mt-1 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-strong underline">
                <Phone className="h-4 w-4" aria-hidden="true" /> {o.customer_phone}
              </a>
              {o.customer_email && <p className="text-sm text-muted">{o.customer_email}</p>}
            </div>
            {a && (
              <div className="text-sm">
                <p>{[a.line1, a.line2, a.landmark].filter(Boolean).join(', ')}</p>
                <p className="font-mono">{a.pincode}</p>
                <a
                  href={a.lat && a.lng ? `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([a.line1, a.line2, a.pincode].filter(Boolean).join(', '))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex min-h-10 items-center gap-1.5 font-semibold text-brand-strong underline"
                >
                  <MapPin className="h-4 w-4" aria-hidden="true" /> {t('orders.directions')}
                </a>
              </div>
            )}
          </section>

          {o.type === 'delivery' && <RiderSection order={o} />}

          <section>
            <h3 className="font-bold">{t('orders.items')}</h3>
            <ul className="mt-2 divide-y divide-line">
              {o.items.map((it, i) => (
                <li key={i} className="flex gap-3 py-2">
                  <span className="w-8 shrink-0 text-lg font-extrabold tabular-nums">{it.quantity}×</span>
                  <span className="flex-1">
                    <span className="font-semibold">{it.name}</span>
                    {(it.variant_name || it.addons.length > 0) && <span className="block text-sm text-muted">{[it.variant_name, ...it.addons.map((x) => `+ ${x.name}`)].filter(Boolean).join(' · ')}</span>}
                    {it.notes && <span className="block text-sm font-semibold text-warn">“{it.notes}”</span>}
                  </span>
                  <span className="tabular-nums">{formatINR(it.line_total)}</span>
                </li>
              ))}
            </ul>
            {o.notes && <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">{t('orders.orderNote', { note: o.notes })}</p>}
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt>{t('order.itemTotal')}</dt><dd className="tabular-nums">{formatINR(o.subtotal)}</dd></div>
              <div className="flex justify-between"><dt>{t('order.gst')}</dt><dd className="tabular-nums">{formatINR(o.tax_total)}</dd></div>
              {Number(o.packaging_fee) > 0 && <div className="flex justify-between"><dt>{t('order.packaging')}</dt><dd className="tabular-nums">{formatINR(o.packaging_fee)}</dd></div>}
              {Number(o.delivery_fee) > 0 && <div className="flex justify-between"><dt>{t('order.delivery')}</dt><dd className="tabular-nums">{formatINR(o.delivery_fee)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-1 text-base font-bold"><dt>{t('order.total')}</dt><dd className="tabular-nums">{formatINR(o.total)}</dd></div>
            </dl>
          </section>

          <section>
            <h3 className="font-bold">{t('orders.history')}</h3>
            <ol className="mt-2 space-y-1 text-sm">
              {o.events.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-28 shrink-0 text-muted tabular-nums">{when(e.at)}</span>
                  <span>
                    {e.status === 'payment' ? t('orders.paymentEvent') : t(`order.status.${e.status}`)}
                    {e.note && <span className="text-muted"> — {e.note}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <NextButton order={o} onCancel={() => onCancel({ id: o.internal_id, number: o.number })} />
        </div>
      )}
    </Dialog>
  );
}

function OrderCard({ o, onOpen, onCancel }: { o: OrderRow; onOpen: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const ago = useTimeAgo();
  const Icon = TYPE_ICON[o.type];
  const late = o.status === 'pending' && Date.now() - new Date(o.placed_at).getTime() > 5 * 60_000;
  return (
    <li className={`card p-4 ${late ? '!border-warn ring-2 ring-warn/30' : ''}`}>
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-center gap-2">
          <span className="text-xl font-extrabold tabular-nums">#{o.number}</span>
          <Icon className="h-4 w-4 text-muted" aria-hidden="true" />
          <span className="text-sm text-muted">{t(`order.type.${o.type}`)}</span>
          <span className="ml-auto text-xs text-muted">{ago(o.placed_at)}</span>
        </div>
        <p className="mt-1 font-semibold">{o.customer_name}</p>
        <p className="text-sm text-muted">
          {t('orders.itemsCount', { count: o.items_count })} · {formatINR(o.total)}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={o.status}>{t(`order.status.${o.status}`)}</Badge>
          <Badge tone={o.payment_status}>{t(`order.payShort.${o.payment_method}`)}</Badge>
          {o.rider_name && (
            <Badge tone="neutral">
              <Bike className="mr-1 h-3 w-3" aria-hidden="true" />
              {o.rider_name}
            </Badge>
          )}
          {o.scheduled_for && <Badge tone="pending">{t('orders.forTime', { time: new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(o.scheduled_for)) })}</Badge>}
        </div>
      </button>
      <div className="mt-3">
        <NextButton order={o} onCancel={onCancel} />
      </div>
    </li>
  );
}

export default function OrdersPage() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const [view, setView] = useState<View>('active');
  const [type, setType] = useState<OrderType | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  // From the dashboard search: ?open=<order id> opens that order.
  useOpenParam((v) => Number(v) > 0 && setOpenId(Number(v)));
  const [cancelling, setCancelling] = useState<{ id: number; number: number } | null>(null);
  const sound = useAlertPrefs((s) => s.sound);
  const setSound = useAlertPrefs((s) => s.setSound);
  const q = useDebounced(search, 300);
  const query = useQuery({
    queryKey: ['orders', view, type, q, page],
    queryFn: async () => {
      const res = await api.get<OrderRow[]>('/tenant/orders', { view, type, search: q, page });
      return { rows: res.data, meta: res.meta as { current_page: number; last_page: number; total: number; counts: OrderFeed['counts'] } };
    },
    placeholderData: keepPreviousData,
    refetchInterval: view === 'active' ? 10_000 : false,
  });
  const counts = query.data?.meta.counts;
  const rows = query.data?.rows ?? [];
  const columns: { key: string; title: string; statuses: OrderStatus[] }[] = [
    { key: 'new', title: t('orders.colNew'), statuses: ['pending'] },
    { key: 'kitchen', title: t('orders.colKitchen'), statuses: ['confirmed', 'preparing'] },
    { key: 'ready', title: t('orders.colReady'), statuses: ['ready', 'out_for_delivery'] },
  ];

  const askNotifications = () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t('orders.title')}</h1>
          <p className="text-muted">{t('orders.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-outline !min-h-10 text-sm"
            aria-pressed={sound}
            onClick={() => {
              setSound(!sound);
              if (!sound) {
                playChime();
                askNotifications();
              }
            }}
          >
            {sound ? <Bell className="h-4 w-4" aria-hidden="true" /> : <BellOff className="h-4 w-4" aria-hidden="true" />}
            {sound ? t('orders.soundOn') : t('orders.soundOff')}
          </button>
          <button type="button" className="btn-ghost !min-h-10 text-sm" onClick={() => void query.refetch()}>
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" /> {t('orders.refresh')}
          </button>
        </div>
      </div>
      {session?.tenant?.is_demo && <Alert tone="info">{t('orders.demoHint', { host: session.tenant.site_host })}</Alert>}

      {counts && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['pending', t('orders.colNew')],
              ['in_kitchen', t('orders.colKitchen')],
              ['ready', t('orders.colReady')],
              ['scheduled', t('orders.scheduled')],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className={`card p-4 ${k === 'pending' && counts.pending > 0 ? '!border-warn' : ''}`}>
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="text-3xl font-extrabold tabular-nums">{counts[k]}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={t('orders.title')} className="flex gap-1 overflow-x-auto">
          {(['active', 'scheduled', 'completed', 'cancelled', 'all'] as View[]).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => { setView(v); setPage(1); }} className={`min-h-10 whitespace-nowrap rounded-full px-4 text-sm font-semibold ${view === v ? 'bg-ink text-paper' : 'hover:bg-ink/5'}`}>
              {t(`orders.view.${v}`)}
            </button>
          ))}
        </div>
        <select aria-label={t('orders.type')} className="field-input !w-auto !py-2" value={type} onChange={(e) => { setType(e.target.value as OrderType | ''); setPage(1); }}>
          <option value="">{t('orders.allTypes')}</option>
          {(['delivery', 'takeaway', 'dine_in', 'room_service'] as OrderType[]).map((ty) => (
            <option key={ty} value={ty}>
              {t(`order.type.${ty}`)}
            </option>
          ))}
        </select>
        <label className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input type="search" className="field-input !pl-9" placeholder={t('orders.search')} aria-label={t('orders.search')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </label>
      </div>

      {query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <SkeletonRows rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState title={view === 'active' ? t('orders.emptyActive') : t('orders.empty')}>{view === 'active' && t('orders.emptyActiveHint')}</EmptyState>
      ) : view === 'active' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {columns.map((c) => {
            const list = rows.filter((o) => c.statuses.includes(o.status));
            return (
              <section key={c.key} aria-labelledby={`col-${c.key}`}>
                <h2 id={`col-${c.key}`} className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted">
                  {c.title} <span className="rounded-full bg-ink/5 px-2 tabular-nums">{list.length}</span>
                </h2>
                <ul className="space-y-3">
                  {list.map((o) => (
                    <OrderCard key={o.id} o={o} onOpen={() => setOpenId(o.id)} onCancel={() => setCancelling({ id: o.id, number: o.number })} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">{t('orders.customer')}</th>
                  <th className="px-4 py-3">{t('orders.type')}</th>
                  <th className="px-4 py-3">{t('orders.status')}</th>
                  <th className="px-4 py-3 text-right">{t('order.total')}</th>
                  <th className="px-4 py-3">{t('orders.placed')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((o) => (
                  <tr key={o.id} className="cursor-pointer hover:bg-paper" onClick={() => setOpenId(o.id)}>
                    <td className="px-4 py-3 font-bold">
                      <button type="button" className="underline-offset-2 hover:underline" onClick={() => setOpenId(o.id)}>
                        #{o.number}
                      </button>
                    </td>
                    <td className="px-4 py-3">{o.customer_name}</td>
                    <td className="px-4 py-3">{t(`order.type.${o.type}`)}</td>
                    <td className="px-4 py-3"><Badge tone={o.status}>{t(`order.status.${o.status}`)}</Badge></td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatINR(o.total)}</td>
                    <td className="px-4 py-3 text-muted">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(o.placed_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {query.data && query.data.meta.last_page > 1 && (
            <div className="flex items-center justify-end gap-2">
              <button type="button" className="btn-outline !min-h-10" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                {t('common.previous')}
              </button>
              <span className="text-sm">{t('common.pageOf', { page, total: query.data.meta.last_page })}</span>
              <button type="button" className="btn-outline !min-h-10" disabled={page >= query.data.meta.last_page} onClick={() => setPage(page + 1)}>
                {t('common.next')}
              </button>
            </div>
          )}
        </>
      )}

      <OrderDetailDialog id={openId} onClose={() => setOpenId(null)} onCancel={(o) => { setOpenId(null); setCancelling(o); }} />
      <CancelDialog key={cancelling?.id ?? 0} order={cancelling} onClose={() => setCancelling(null)} />
      <p className="flex items-center gap-2 text-xs text-muted">
        <Store className="h-4 w-4" aria-hidden="true" /> {t('orders.liveNote')}
      </p>
    </div>
  );
}
