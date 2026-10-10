import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BellRing, Download, LayoutGrid, Minus, Plus, ReceiptText, Send, Trash2, Wifi, WifiOff } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatMoney as formatINR } from '@/lib/format';
import { useLive, useLiveStatus } from '@/lib/realtime';
import { useCan, useFeature, useSession } from '@/hooks/useSession';
import { Alert, Spinner, toast } from '@/components/ui';
import { FoodTypeMark } from '@/site/components/bits';
import { useLiveTables, type LiveTable, type TableBill } from '@/features/tables/api';
import { MenuPicker } from '@/features/pos/MenuPicker';
import { usePosMenu, type TicketLine } from '@/features/pos/api';
import { playChime, useAlertPrefs } from '@/features/orders/alerts';

const STATE: Record<LiveTable['state'], string> = {
  free: 'bg-[#e6f4ea] border-[#2E9A55] text-[#14110f]',
  occupied: 'bg-[#fdebd8] border-[#c2410c] text-[#14110f]',
  bill_requested: 'bg-[#fef3c7] border-[#b45309] text-[#14110f]',
  cleaning: 'bg-[#eceae6] border-[#8c8377] border-dashed text-[#14110f]',
  inactive: 'bg-[#f5f3ef] border-[#d6d0c6] text-[#8c8377]',
};

/** Installs the app (manifest + service worker) only on this screen. */
function usePwa() {
  const [prompt, setPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/waiter/manifest.webmanifest';
      document.head.appendChild(link);
    }
    if ('serviceWorker' in navigator && import.meta.env.PROD) void navigator.serviceWorker.register('/waiter/sw.js', { scope: '/waiter/' });
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  return prompt;
}

function TableScreen({ table, onBack }: { table: LiveTable; onBack: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const menu = usePosMenu();
  const [adding, setAdding] = useState(!table.session);
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [error, setError] = useState('');
  const bill = useQuery({
    queryKey: ['table-bill', table.session?.id],
    queryFn: async () => (await api.get<TableBill>(`/tenant/tables/sessions/${table.session!.id}`)).data,
    enabled: !!table.session,
    refetchInterval: 15_000,
  });
  const send = useMutation<{ data: { number: number } }, ApiError>({
    mutationFn: () =>
      api.post('/tenant/pos/orders', {
        type: 'dine_in',
        source: 'waiter',
        dining_table_id: table.id,
        items: lines.map((l) => ({ item_id: l.item_id, variant_id: l.variant_id, addon_ids: l.addon_ids, quantity: l.quantity, notes: l.notes || null })),
      }),
    onSuccess: (res) => {
      toast.success(t('waiter.sent', { number: res.data.number, table: table.label }));
      setLines([]);
      setAdding(false);
      setError('');
      void qc.invalidateQueries({ queryKey: ['tables-live'] });
      void qc.invalidateQueries({ queryKey: ['table-bill'] });
    },
    onError: (e) => setError(e.errors ? Object.values(e.errors)[0][0] : e.message),
  });
  const done = useMutation<unknown, ApiError, number>({
    mutationFn: (id) => api.post(`/tenant/tables/requests/${id}/done`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tables-live'] }),
  });
  const add = (l: TicketLine) => {
    const f = lines.find((x) => x.key === l.key);
    setLines(f ? lines.map((x) => (x.key === l.key ? { ...x, quantity: x.quantity + l.quantity } : x)) : [...lines, l]);
  };
  const qty = (key: string, d: number) => setLines(lines.flatMap((l) => (l.key === key ? (l.quantity + d <= 0 ? [] : [{ ...l, quantity: l.quantity + d }]) : [l])));
  const count = lines.reduce((n, l) => n + l.quantity, 0);

  return (
    <div className="pb-40">
      <div className="sticky top-14 z-10 flex items-center gap-3 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <button type="button" onClick={onBack} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-ink/5" aria-label={t('common.back')}>
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex-1">
          <p className="text-xl font-extrabold leading-none">{table.label}</p>
          <p className="text-xs text-muted">
            {t(`tablesAdmin.state.${table.state}`)} · {t('reservationsAdmin.seats', { count: table.seats })}
          </p>
        </div>
        {table.session && <p className="text-lg font-bold tabular-nums">{formatINR(table.session.total)}</p>}
      </div>

      <div className="space-y-4 p-4">
        {table.requests.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-warn-soft p-3 font-semibold text-warn">
            {r.type === 'bill' ? <ReceiptText className="h-5 w-5" aria-hidden="true" /> : <BellRing className="h-5 w-5" aria-hidden="true" />}
            <span className="flex-1">{t(`tablesAdmin.request.${r.type}`)}</span>
            <button type="button" className="rounded-xl bg-surface px-4 py-2 text-sm font-bold text-ink" onClick={() => done.mutate(r.id)}>
              {t('tablesAdmin.done')}
            </button>
          </div>
        ))}

        {adding ? (
          menu.data ? <MenuPicker menu={menu.data} onAdd={add} compact /> : <Spinner />
        ) : (
          <>
            {bill.data?.orders.map((o) => (
              <section key={o.id} className="card p-3">
                <p className="flex justify-between text-sm font-bold">
                  <span>#{o.number}</span>
                  <span className="text-muted">{t(`order.status.${o.status}`)}</span>
                </p>
                <ul className="mt-1 text-sm">
                  {o.items.map((i, n) => (
                    <li key={n} className="flex gap-2">
                      <FoodTypeMark type={i.food_type} className="mt-0.5" />
                      <span className="flex-1">
                        {i.quantity} × {i.name}
                        {i.variant_name && <span className="text-muted"> ({i.variant_name})</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!table.session && <p className="py-6 text-center text-muted">{t('waiter.freeTable')}</p>}
            <button type="button" className="btn-primary w-full" onClick={() => setAdding(true)}>
              <Plus className="h-5 w-5" aria-hidden="true" /> {t('waiter.addItems')}
            </button>
          </>
        )}
      </div>

      {adding && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface p-3 shadow-2xl" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
          {lines.length > 0 && (
            <ul className="mb-2 max-h-40 divide-y divide-line overflow-y-auto">
              {lines.map((l) => (
                <li key={l.key} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="flex-1 truncate">
                    {l.name}
                    {l.detail && <span className="text-muted"> · {l.detail}</span>}
                  </span>
                  <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-line" onClick={() => qty(l.key, -1)} aria-label={t('order.decrease', { name: l.name })}>
                    {l.quantity === 1 ? <Trash2 className="h-4 w-4" aria-hidden="true" /> : <Minus className="h-4 w-4" aria-hidden="true" />}
                  </button>
                  <span className="w-5 text-center font-bold tabular-nums">{l.quantity}</span>
                  <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-line" onClick={() => qty(l.key, 1)} aria-label={t('order.increase', { name: l.name })}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <Alert>{error}</Alert>}
          <div className="flex gap-2">
            <button type="button" className="btn-outline" onClick={() => { setAdding(false); setLines([]); }}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn-primary flex-1" disabled={!lines.length || send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? <Spinner /> : <><Send className="h-4 w-4" aria-hidden="true" /> {t('waiter.send', { count })}</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Phone app for waiters (installable): tables, add items and send them to the kitchen, guest calls. */
export default function WaiterApp() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const canTables = useCan('tables.manage');
  const canOrder = useCan('orders.create');
  const hasTables = useFeature('qr_ordering');
  const allowed = canTables && canOrder && hasTables;
  const connected = useLiveStatus((s) => s.connected);
  const sound = useAlertPrefs((s) => s.sound);
  const install = usePwa();
  const live = useLiveTables(allowed);
  const [openId, setOpenId] = useState<number | null>(null);
  const [tab, setTab] = useState<'tables' | 'calls'>('tables');
  useLive(session?.tenant?.id, 'tables', allowed, () => void qc.invalidateQueries({ queryKey: ['tables-live'] }));

  const tables = useMemo(() => live.data ?? [], [live.data]);
  const calls = tables.flatMap((x) => x.requests.map((r) => ({ ...r, table: x })));
  // Chime when a new call appears.
  const [seen, setSeen] = useState<Set<number> | null>(null);
  useEffect(() => {
    const ids = new Set(calls.map((c) => c.id));
    if (seen && [...ids].some((id) => !seen.has(id)) && sound) playChime();
    if (live.data) setSeen(ids);
  }, [live.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = useMutation<unknown, ApiError, number>({
    mutationFn: (id) => api.post(`/tenant/tables/requests/${id}/done`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tables-live'] }),
  });
  const open = tables.find((x) => x.id === openId);

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-[#14110F] px-4 text-white">
        <p className="font-extrabold">{t('waiter.title')}</p>
        <span className="truncate text-sm opacity-80">{session?.tenant?.name}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-xs" aria-label={connected ? t('kds.live') : t('kds.polling')}>
          {connected ? <Wifi className="h-4 w-4 text-[#4ade80]" aria-hidden="true" /> : <WifiOff className="h-4 w-4 opacity-70" aria-hidden="true" />}
        </span>
        {install && (
          <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold" onClick={() => void install.prompt()}>
            <Download className="h-4 w-4" aria-hidden="true" /> {t('waiter.install')}
          </button>
        )}
      </header>

      {!allowed ? (
        <p className="p-6 text-center">{hasTables ? t('waiter.noAccess') : t('waiter.noPlan')}</p>
      ) : open ? (
        <TableScreen key={open.id} table={open} onBack={() => setOpenId(null)} />
      ) : (
        <main className="p-4 pb-28">
          {tab === 'tables' ? (
            <>
              {live.isLoading && <Spinner />}
              {!live.isLoading && !tables.length && <p className="py-10 text-center text-muted">{t('tablesAdmin.emptyText')}</p>}
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {tables.filter((x) => x.is_active).map((x) => (
                  <li key={x.id}>
                    <button type="button" onClick={() => setOpenId(x.id)} className={`relative flex aspect-square w-full flex-col items-center justify-center rounded-2xl border-2 p-1 ${STATE[x.state]}`}>
                      <span className="text-xl font-extrabold">{x.label}</span>
                      <span className="text-[11px] font-semibold">{x.session ? formatINR(x.session.total) : t(`tablesAdmin.state.${x.state}`)}</span>
                      {x.requests.length > 0 && <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#b45309] text-xs font-bold text-white">{x.requests.length}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <ul className="space-y-2">
              {calls.length === 0 && <p className="py-10 text-center text-muted">{t('waiter.noCalls')}</p>}
              {calls.map((c) => (
                <li key={c.id} className="card flex items-center gap-3 p-3">
                  {c.type === 'bill' ? <ReceiptText className="h-5 w-5 text-warn" aria-hidden="true" /> : <BellRing className="h-5 w-5 text-warn" aria-hidden="true" />}
                  <button type="button" className="flex-1 text-left" onClick={() => setOpenId(c.table.id)}>
                    <span className="block font-bold">{c.table.label}</span>
                    <span className="text-sm text-muted">
                      {t(`tablesAdmin.request.${c.type}`)} · {t('orders.minutesAgo', { count: Math.max(0, Math.round((Date.now() - new Date(c.created_at).getTime()) / 60000)) })}
                    </span>
                  </button>
                  <button type="button" className="btn-primary !min-h-10 text-sm" onClick={() => done.mutate(c.id)}>
                    {t('tablesAdmin.done')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </main>
      )}

      {allowed && !open && (
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-2 border-t border-line bg-surface" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label={t('waiter.title')}>
          {(['tables', 'calls'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={`relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${tab === k ? 'text-ink' : 'text-muted'}`}>
              {k === 'tables' ? <LayoutGrid className="h-5 w-5" aria-hidden="true" /> : <BellRing className="h-5 w-5" aria-hidden="true" />}
              {t(`waiter.tab.${k}`)}
              {k === 'calls' && calls.length > 0 && <span className="absolute right-[30%] top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{calls.length}</span>}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
