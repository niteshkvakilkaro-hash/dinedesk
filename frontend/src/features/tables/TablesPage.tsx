import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useTabParam } from '@/lib/urlParams';
import QRCode from 'qrcode';
import { BellRing, CalendarCheck, LayoutGrid, Pencil, Plus, Printer, QrCode, ReceiptText, RefreshCw, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { printPage } from '@/lib/print';
import { formatINR, formatTime } from '@/lib/format';
import { useCan } from '@/hooks/useSession';
import { Alert, Badge, Dialog, EmptyState, ErrorState, Field, SkeletonRows, Spinner, toast, Toggle } from '@/components/ui';
import { useLiveTables, useTables, type LiveTable, type TableBill, type TableRow } from './api';
import { FloorEditor, FloorView } from './Floor';
import { useLive } from '@/lib/realtime';
import { useSession } from '@/hooks/useSession';

const PAYMENT_MODES = ['cash', 'upi', 'card', 'online', 'none'] as const;

function useQr(url: string | null, width = 320) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    void QRCode.toDataURL(url, { width, margin: 2, color: { dark: '#14110f', light: '#ffffff' } }).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [url, width]);
  return src;
}

function minutesSince(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function clock(iso: string) {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
}

// ---------- Live board ----------

function BillDialog({ sessionId, onClose }: { sessionId: number | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<(typeof PAYMENT_MODES)[number]>('cash');
  const [confirming, setConfirming] = useState(false);
  const bill = useQuery({
    queryKey: ['table-bill', sessionId],
    queryFn: async () => (await api.get<TableBill>(`/tenant/tables/sessions/${sessionId}`)).data,
    enabled: !!sessionId,
  });
  const close = useMutation<unknown, ApiError>({
    mutationFn: () => api.post(`/tenant/tables/sessions/${sessionId}/close`, { payment_mode: mode }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tables-live'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success(t('tablesAdmin.closed', { table: bill.data?.table }));
      setConfirming(false);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  useEffect(() => {
    if (bill.data && Number(bill.data.totals.due) === 0 && Number(bill.data.totals.paid) > 0) setMode('online');
  }, [bill.data]);
  if (!sessionId) return null;
  const b = bill.data;

  return (
    <Dialog open onClose={onClose} title={b ? t('tablesAdmin.billTitle', { table: b.table }) : t('tablesAdmin.bill')} wide>
      {bill.isLoading && <SkeletonRows rows={3} />}
      {bill.isError && <ErrorState message={(bill.error as Error).message} onRetry={() => void bill.refetch()} />}
      {b && (
        <div className="space-y-5">
          <p className="text-sm text-muted">
            {t('tablesAdmin.openSince', { time: clock(b.opened_at) })}
            {b.bill_requested_at && ` · ${t('tablesAdmin.billAskedAt', { time: clock(b.bill_requested_at) })}`}
          </p>
          {!b.orders.length && <p>{t('tablesAdmin.noOrders')}</p>}
          <ul className="space-y-3">
            {b.orders.map((o) => (
              <li key={o.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-extrabold tabular-nums">#{o.number}</span>
                  <span className="text-sm text-muted">{o.customer_name}</span>
                  <Badge tone={o.status}>{t(`order.status.${o.status}`)}</Badge>
                  {o.payment_status === 'paid' && <Badge tone="paid">{t('tablesAdmin.paid')}</Badge>}
                  <span className="ml-auto font-semibold tabular-nums">{formatINR(o.total)}</span>
                </div>
                <ul className="mt-2 text-sm">
                  {o.items.map((i, n) => (
                    <li key={n} className="flex justify-between gap-3">
                      <span>
                        {i.quantity} × {i.name}
                        {(i.variant_name || i.addons.length > 0) && <span className="text-muted"> ({[i.variant_name, ...i.addons.map((a) => a.name)].filter(Boolean).join(', ')})</span>}
                      </span>
                      <span className="tabular-nums text-muted">{formatINR(Number(i.unit_price) * i.quantity)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <dl className="space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between">
              <dt>{b.totals.prices_include_tax ? t('order.itemsInclGst') : t('order.itemTotal')}</dt>
              <dd className="tabular-nums">{formatINR(b.totals.subtotal)}</dd>
            </div>
            {Number(b.totals.tax_total) > 0 && (
              <div className="flex justify-between">
                <dt>{b.totals.prices_include_tax ? t('order.gstIncluded') : t('order.gst')}</dt>
                <dd className="tabular-nums">{formatINR(b.totals.tax_total)}</dd>
              </div>
            )}
            <div className="flex justify-between text-lg font-extrabold">
              <dt>{t('order.total')}</dt>
              <dd className="tabular-nums">{formatINR(b.totals.total)}</dd>
            </div>
            {Number(b.totals.paid) > 0 && (
              <div className="flex justify-between text-success">
                <dt>{t('tablesAdmin.paidOnline')}</dt>
                <dd className="tabular-nums">− {formatINR(b.totals.paid)}</dd>
              </div>
            )}
            <div className="flex justify-between font-bold">
              <dt>{t('tablesAdmin.toCollect')}</dt>
              <dd className="tabular-nums">{formatINR(b.totals.due)}</dd>
            </div>
          </dl>
          {b.status === 'open' && (
            <fieldset className="space-y-3">
              <legend className="field-label">{t('tablesAdmin.paidBy')}</legend>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_MODES.map((m) => (
                  <label key={m} className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold ${mode === m ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
                    <input type="radio" className="sr-only" checked={mode === m} onChange={() => setMode(m)} />
                    {t(`tablesAdmin.mode.${m}`)}
                  </label>
                ))}
              </div>
              {confirming ? (
                <Alert tone="warn">
                  <p>{t('tablesAdmin.closeConfirm', { amount: formatINR(b.totals.due) })}</p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" className="btn-primary !min-h-10" disabled={close.isPending} onClick={() => close.mutate()}>
                      {close.isPending ? <Spinner /> : t('tablesAdmin.closeYes')}
                    </button>
                    <button type="button" className="btn-ghost !min-h-10" onClick={() => setConfirming(false)}>
                      {t('common.back')}
                    </button>
                  </div>
                </Alert>
              ) : (
                <button type="button" className="btn-primary w-full" onClick={() => setConfirming(true)}>
                  {t('tablesAdmin.settle')}
                </button>
              )}
            </fieldset>
          )}
        </div>
      )}
    </Dialog>
  );
}

const STATE_STYLE: Record<LiveTable['state'], string> = {
  free: '',
  occupied: '!border-brand/50 bg-brand-soft/40',
  bill_requested: '!border-warn ring-2 ring-warn/30',
  cleaning: 'border-dashed !border-ink/30 bg-ink/5',
  inactive: 'opacity-55',
};

function LiveCard({ table, onBill }: { table: LiveTable; onBill: (sessionId: number) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const done = useMutation<unknown, ApiError, number>({
    mutationFn: (id) => api.post(`/tenant/tables/requests/${id}/done`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tables-live'] }),
    onError: (e) => toast.error(e.message),
  });
  const s = table.session;
  return (
    <li className={`card flex flex-col gap-3 p-4 ${STATE_STYLE[table.state]}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-2xl font-extrabold leading-none">{table.label}</p>
          <p className="mt-1 text-xs text-muted">
            {t('reservationsAdmin.seats', { count: table.seats })}
            {table.area && ` · ${table.area}`}
          </p>
        </div>
        <Badge tone={table.state === 'free' ? 'live' : table.state === 'bill_requested' ? 'pending' : table.state === 'occupied' ? 'confirmed' : 'unpaid'}>{t(`tablesAdmin.state.${table.state}`)}</Badge>
      </div>
      {table.requests.length > 0 && (
        <ul className="space-y-1.5">
          {table.requests.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-lg bg-warn-soft px-2.5 py-1.5 text-sm font-semibold text-warn">
              {r.type === 'bill' ? <ReceiptText className="h-4 w-4" aria-hidden="true" /> : <BellRing className="h-4 w-4" aria-hidden="true" />}
              <span className="flex-1">
                {t(`tablesAdmin.request.${r.type}`)} · {t('orders.minutesAgo', { count: minutesSince(r.created_at) })}
              </span>
              <button type="button" className="rounded-md bg-surface px-2 py-1 text-xs font-bold text-ink" disabled={done.isPending} onClick={() => done.mutate(r.id)}>
                {t('tablesAdmin.done')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {s ? (
        <div className="text-sm">
          <p>
            {t('tablesAdmin.sessionLine', { count: s.orders_count, orders: s.orders_count, items: s.items_count })} · <span className="font-bold">{formatINR(s.total)}</span>
          </p>
          <p className="text-muted">
            {t('tablesAdmin.since', { time: clock(s.opened_at) })}
            {s.active_orders > 0 && ` · ${t('tablesAdmin.inKitchen', { count: s.active_orders })}`}
          </p>
        </div>
      ) : (
        table.is_active && <p className="text-sm text-muted">{t('tablesAdmin.freeHint')}</p>
      )}
      {table.booking && (
        <p className="flex items-center gap-1.5 text-sm">
          <CalendarCheck className="h-4 w-4 text-muted" aria-hidden="true" />
          {t('tablesAdmin.booked', { time: formatTime(table.booking.time), name: table.booking.name, count: table.booking.party_size })}
        </p>
      )}
      {s && (
        <button type="button" className="btn-outline mt-auto !min-h-10 text-sm" onClick={() => onBill(s.id)}>
          <ReceiptText className="h-4 w-4" aria-hidden="true" />
          {t('tablesAdmin.viewBill')}
        </button>
      )}
    </li>
  );
}

function LiveTab({ onSetup }: { onSetup?: () => void }) {
  const { t } = useTranslation();
  const live = useLiveTables();
  const [bill, setBill] = useState<number | null>(null);
  const [view, setView] = useState<'floor' | 'cards'>(() => {
    try {
      return (localStorage.getItem('dd_tables_view') as 'floor' | 'cards') || 'floor';
    } catch {
      return 'floor';
    }
  });
  const pick = (v: 'floor' | 'cards') => {
    setView(v);
    try {
      localStorage.setItem('dd_tables_view', v);
    } catch {
      /* ignore */
    }
  };
  const tables = live.data ?? [];
  const busy = tables.filter((x) => x.session).length;
  const asks = tables.reduce((n, x) => n + x.requests.length, 0);

  if (live.isLoading) return <SkeletonRows rows={4} />;
  if (live.isError) return <ErrorState message={(live.error as Error).message} onRetry={() => void live.refetch()} />;
  if (!tables.length) {
    return (
      <EmptyState title={t('tablesAdmin.emptyTitle')} action={onSetup && <button type="button" className="btn-primary" onClick={onSetup}>{t('tablesAdmin.setUp')}</button>}>
        {t('tablesAdmin.emptyText')}
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {t('tablesAdmin.liveSummary', { busy, total: tables.filter((x) => x.is_active).length })}
          {asks > 0 && ` · ${t('tablesAdmin.openRequests', { count: asks })}`}
        </p>
        <div className="flex gap-1 rounded-full bg-ink/5 p-1" role="radiogroup" aria-label={t('tablesAdmin.view')}>
          {(['floor', 'cards'] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => pick(v)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${view === v ? 'bg-surface shadow' : 'text-muted'}`}>
              {t(`tablesAdmin.views.${v}`)}
            </button>
          ))}
        </div>
      </div>
      {view === 'floor' ? <FloorView tables={tables} /> : (
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tables.map((tb) => (
          <LiveCard key={tb.id} table={tb} onBill={setBill} />
        ))}
      </ul>
      )}
      <BillDialog sessionId={bill} onClose={() => setBill(null)} />
    </div>
  );
}

// ---------- Setup ----------

function TableEditor({ table, onClose }: { table: TableRow | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const tb = table === 'new' ? null : table;
  const [form, setForm] = useState({ label: '', seats: 4, area: '', is_active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (table) setForm({ label: tb?.label ?? '', seats: tb?.seats ?? 4, area: tb?.area ?? '', is_active: tb?.is_active ?? true });
    setErrors({});
  }, [table]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => (tb ? api.put(`/tenant/tables/${tb.id}`, { ...form, area: form.area || null }) : api.post('/tenant/tables', { ...form, area: form.area || null })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tables'] });
      void qc.invalidateQueries({ queryKey: ['tables-live'] });
      toast.success(t('common.saved'));
      onClose();
    },
    onError: (e) => setErrors(e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])) : { label: e.message }),
  });
  if (!table) return null;
  return (
    <Dialog open onClose={onClose} title={tb ? t('tablesAdmin.edit', { table: tb.label }) : t('tablesAdmin.add')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate>
        <Field label={t('tablesAdmin.label')} hint={t('tablesAdmin.labelHint')} error={errors.label}>
          {(a) => <input {...a} className="field-input" maxLength={40} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} data-autofocus />}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('tablesAdmin.seatsLabel')} error={errors.seats}>
            {(a) => <input {...a} type="number" min={1} max={40} className="field-input" value={form.seats} onChange={(e) => setForm({ ...form, seats: Math.max(1, Number(e.target.value) || 1) })} />}
          </Field>
          <Field label={t('tablesAdmin.area')} optional hint={t('tablesAdmin.areaHint')} error={errors.area}>
            {(a) => <input {...a} className="field-input" maxLength={60} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />}
          </Field>
        </div>
        <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label={t('tablesAdmin.active')} hint={t('tablesAdmin.activeHint')} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : t('common.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Add T1…T10 in one go. */
function BulkAdd({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: string[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({ prefix: 'T', from: 1, to: 10, seats: 4 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const labels = Array.from({ length: Math.max(0, Math.min(60, form.to - form.from + 1)) }, (_, i) => `${form.prefix}${form.from + i}`).filter((l) => !existing.some((e) => e.toLowerCase() === l.toLowerCase()));
  const run = async () => {
    setBusy(true);
    setError('');
    try {
      for (const label of labels) await api.post('/tenant/tables', { label, seats: form.seats });
      toast.success(t('tablesAdmin.bulkDone', { count: labels.length }));
      onClose();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ['tables'] });
      void qc.invalidateQueries({ queryKey: ['tables-live'] });
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title={t('tablesAdmin.bulkTitle')}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label={t('tablesAdmin.prefix')}>{(a) => <input {...a} className="field-input" maxLength={10} value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} />}</Field>
          <Field label={t('tablesAdmin.from')}>{(a) => <input {...a} type="number" min={1} className="field-input" value={form.from} onChange={(e) => setForm({ ...form, from: Math.max(1, Number(e.target.value) || 1) })} />}</Field>
          <Field label={t('tablesAdmin.to')}>{(a) => <input {...a} type="number" min={1} className="field-input" value={form.to} onChange={(e) => setForm({ ...form, to: Math.max(1, Number(e.target.value) || 1) })} />}</Field>
          <Field label={t('tablesAdmin.seatsLabel')}>{(a) => <input {...a} type="number" min={1} max={40} className="field-input" value={form.seats} onChange={(e) => setForm({ ...form, seats: Math.max(1, Number(e.target.value) || 1) })} />}</Field>
        </div>
        <p className="text-sm text-muted">{labels.length ? t('tablesAdmin.bulkPreview', { list: labels.slice(0, 8).join(', ') + (labels.length > 8 ? '…' : ''), count: labels.length }) : t('tablesAdmin.bulkNone')}</p>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary" disabled={busy || !labels.length} onClick={() => void run()}>
            {busy ? <Spinner /> : t('tablesAdmin.bulkAdd', { count: labels.length })}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function QrThumb({ table }: { table: TableRow }) {
  const { t } = useTranslation();
  const src = useQr(table.qr_url, 512);
  if (!src) return <span className="h-16 w-16 animate-pulse rounded-lg bg-ink/5" />;
  return (
    <a href={src} download={`table-${table.label}.png`} className="group relative block h-16 w-16 shrink-0" title={t('tablesAdmin.downloadQr')}>
      <img src={src} alt={t('tablesAdmin.qrAlt', { table: table.label })} className="h-16 w-16 rounded-lg border border-line" />
      <span className="sr-only">{t('tablesAdmin.downloadQr')}</span>
    </a>
  );
}

function PrintCard({ table, business }: { table: TableRow; business: string }) {
  const { t } = useTranslation();
  const src = useQr(table.qr_url, 600);
  return (
    <div className="qr-card flex flex-col items-center justify-center rounded-2xl border-2 border-black p-6 text-center text-black">
      <p className="text-sm font-bold uppercase tracking-widest">{business}</p>
      <p className="mt-2 text-4xl font-extrabold">{table.label}</p>
      {src && <img src={src} alt="" className="mt-3 h-52 w-52" />}
      <p className="mt-3 text-base font-semibold">{t('tablesAdmin.printScan')}</p>
      <p className="mt-1 text-xs">{t('tablesAdmin.printHint')}</p>
    </div>
  );
}

function SetupTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const query = useTables();
  const [editing, setEditing] = useState<TableRow | 'new' | null>(null);
  const [bulk, setBulk] = useState(false);
  const [removing, setRemoving] = useState<TableRow | null>(null);
  const [renewing, setRenewing] = useState<TableRow | null>(null);
  const [arranging, setArranging] = useState(false);
  const tables = query.data?.tables ?? [];
  const mutate = useMutation<unknown, ApiError, { kind: 'delete' | 'qr'; table: TableRow }>({
    mutationFn: ({ kind, table }) => (kind === 'delete' ? api.delete(`/tenant/tables/${table.id}`) : api.post(`/tenant/tables/${table.id}/qr`)),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['tables'] });
      void qc.invalidateQueries({ queryKey: ['tables-live'] });
      toast.success(v.kind === 'delete' ? t('tablesAdmin.removed') : t('tablesAdmin.renewed'));
      setRemoving(null);
      setRenewing(null);
    },
    onError: (e) => toast.error(e.message),
  });

  if (query.isLoading) return <SkeletonRows rows={4} />;
  if (query.isError) return <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary !min-h-10 text-sm" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('tablesAdmin.add')}
        </button>
        <button type="button" className="btn-outline !min-h-10 text-sm" onClick={() => setBulk(true)}>
          <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          {t('tablesAdmin.bulkTitle')}
        </button>
        <button type="button" className="btn-outline !min-h-10 text-sm" aria-pressed={arranging} onClick={() => setArranging(!arranging)} disabled={!tables.length}>
          <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          {t('tablesAdmin.arrange')}
        </button>
        <button type="button" className="btn-outline !min-h-10 text-sm" onClick={() => printPage()} disabled={!tables.some((x) => x.is_active)}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          {t('tablesAdmin.print')}
        </button>
      </div>
      {arranging && <FloorEditor tables={tables} onSaved={() => setArranging(false)} />}
      <Alert tone="info">{t('tablesAdmin.qrHint')}</Alert>
      {!tables.length && <EmptyState title={t('tablesAdmin.emptyTitle')}>{t('tablesAdmin.emptyText')}</EmptyState>}
      <ul className="card divide-y divide-line">
        {tables.map((tb) => (
          <li key={tb.id} className={`flex flex-wrap items-center gap-4 p-4 ${tb.is_active ? '' : 'opacity-60'}`}>
            <QrThumb table={tb} />
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {tb.label} {!tb.is_active && <Badge tone="unpaid">{t('tablesAdmin.off')}</Badge>}
              </p>
              <p className="text-sm text-muted">
                {t('reservationsAdmin.seats', { count: tb.seats })}
                {tb.area && ` · ${tb.area}`}
              </p>
              <a href={tb.qr_url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-muted underline">
                {tb.qr_url}
              </a>
            </div>
            <div className="flex gap-1">
              <button type="button" className="btn-ghost !min-h-10 !px-2.5" onClick={() => setEditing(tb)} aria-label={t('tablesAdmin.edit', { table: tb.label })}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className="btn-ghost !min-h-10 !px-2.5" onClick={() => setRenewing(tb)} aria-label={t('tablesAdmin.newQr', { table: tb.label })}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className="btn-ghost !min-h-10 !px-2.5 text-danger" onClick={() => setRemoving(tb)} aria-label={t('tablesAdmin.remove', { table: tb.label })}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <TableEditor table={editing} onClose={() => setEditing(null)} />
      <BulkAdd open={bulk} onClose={() => setBulk(false)} existing={tables.map((x) => x.label)} />
      <Dialog open={!!removing || !!renewing} onClose={() => { setRemoving(null); setRenewing(null); }} title={removing ? t('tablesAdmin.remove', { table: removing.label }) : t('tablesAdmin.newQr', { table: renewing?.label })}>
        <p>{removing ? t('tablesAdmin.removeText') : t('tablesAdmin.newQrText')}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => { setRemoving(null); setRenewing(null); }}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary" disabled={mutate.isPending} onClick={() => mutate.mutate({ kind: removing ? 'delete' : 'qr', table: (removing ?? renewing)! })}>
            {mutate.isPending ? <Spinner /> : removing ? t('common.remove') : t('tablesAdmin.newQrYes')}
          </button>
        </div>
      </Dialog>

      {/* Print sheet: only this shows when printing (A4, two cards across). */}
      <style>{'@media print { body * { visibility: hidden !important; } #qr-sheet, #qr-sheet * { visibility: visible !important; } #qr-sheet { position: absolute; top: 0; left: 0; width: 100%; display: grid !important; } .qr-card { break-inside: avoid; } @page { margin: 12mm; } }'}</style>
      <div id="qr-sheet" className="hidden grid-cols-2 gap-6 bg-white" aria-hidden="true">
        {tables.filter((x) => x.is_active).map((tb) => (
          <PrintCard key={tb.id} table={tb} business={query.data!.business} />
        ))}
      </div>
    </div>
  );
}

export default function TablesPage() {
  const { t } = useTranslation();
  const canSetup = useCan('tables.setup');
  const canRun = useCan('tables.manage');
  const qc = useQueryClient();
  const { data: session } = useSession();
  const [tab, setTab] = useTabParam(['live', 'setup'] as const, 'live');
  useLive(session?.tenant?.id, 'tables', canRun || canSetup, () => void qc.invalidateQueries({ queryKey: ['tables-live'] }));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <QrCode className="h-7 w-7" aria-hidden="true" />
            {t('tablesAdmin.title')}
          </h1>
          <p className="text-muted">{t('tablesAdmin.subtitle')}</p>
        </div>
        {canSetup && (
          <div className="flex gap-1 rounded-full bg-ink/5 p-1" role="tablist">
            {(['live', 'setup'] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-surface shadow' : 'text-muted'}`}>
                {t(`tablesAdmin.tab.${k}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      {tab === 'live' || !canSetup ? <LiveTab onSetup={canSetup ? () => setTab('setup') : undefined} /> : <SetupTab />}
    </div>
  );
}
