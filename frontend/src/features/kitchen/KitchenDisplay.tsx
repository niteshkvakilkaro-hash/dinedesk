import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bell, BellOff, Check, Maximize, RotateCcw, Wifi, WifiOff } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useLive, useLiveStatus, usePollInterval } from '@/lib/realtime';
import { useCan, useFeature, useSession } from '@/hooks/useSession';
import { toast } from '@/components/ui';
import { playChime, useAlertPrefs } from '@/features/orders/alerts';

interface Ticket {
  id: number;
  number: number;
  order_id: number;
  order_number: number | null;
  status: 'new' | 'preparing' | 'ready' | 'served' | 'cancelled';
  order_type: 'dine_in' | 'takeaway' | 'delivery';
  table_label: string | null;
  notes: string | null;
  created_at: string;
  started_at: string | null;
  ready_at: string | null;
  served_at: string | null;
  items: { id: number; name: string; variant_name: string | null; addons: string | null; food_type: 'veg' | 'non_veg' | 'egg'; quantity: number; notes: string | null; done: boolean }[];
}

const NEXT: Record<string, 'preparing' | 'ready' | 'served' | null> = { new: 'preparing', preparing: 'ready', ready: 'served' };
const DOT = { veg: 'bg-[#2E9A55]', non_veg: 'bg-[#C0392B]', egg: 'bg-[#D69E2E]' };

function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function TicketCard({ ticket, now }: { ticket: Ticket; now: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  // Never negative if the server clock is a little ahead of this screen.
  const mins = Math.max(0, Math.floor((now - new Date(ticket.created_at).getTime()) / 60000));
  const late = ticket.status !== 'ready' && mins >= 20;
  const slow = ticket.status !== 'ready' && mins >= 10;
  const move = useMutation<unknown, ApiError, string>({
    mutationFn: (status) => api.post(`/tenant/kitchen/tickets/${ticket.id}/status`, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['kds'] }),
    onError: (e) => toast.error(e.message),
  });
  const tick = useMutation<unknown, ApiError, number>({
    mutationFn: (id) => api.post(`/tenant/kitchen/items/${id}/toggle`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['kds'] }),
  });
  const next = NEXT[ticket.status];
  return (
    <li className={`flex flex-col overflow-hidden rounded-2xl border-2 bg-[#1c1916] ${late ? 'border-[#ef4444]' : slow ? 'border-[#f59e0b]' : 'border-[#3a342e]'}`}>
      <div className={`flex items-center justify-between gap-2 px-4 py-2.5 ${ticket.status === 'ready' ? 'bg-[#14532d]' : late ? 'bg-[#7f1d1d]' : slow ? 'bg-[#78350f]' : 'bg-[#2a2520]'}`}>
        <div>
          <p className="text-xl font-extrabold leading-none">{ticket.table_label ?? t(`order.type.${ticket.order_type}`)}</p>
          <p className="mt-1 text-xs opacity-80">
            K-{ticket.number}
            {ticket.order_number && ` · #${ticket.order_number}`}
            {ticket.table_label && ` · ${t(`order.type.${ticket.order_type}`)}`}
          </p>
        </div>
        <p className="text-2xl font-extrabold tabular-nums" aria-label={t('kds.minutes', { count: mins })}>
          {mins}′
        </p>
      </div>
      <ul className="flex-1 divide-y divide-[#3a342e] px-2 py-1">
        {ticket.items.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => tick.mutate(i.id)} aria-pressed={i.done} className={`flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left ${i.done ? 'opacity-45' : ''}`}>
              <span className="min-w-8 text-xl font-extrabold tabular-nums">{i.quantity}×</span>
              <span className="flex-1">
                <span className={`flex items-center gap-2 text-lg font-semibold leading-tight ${i.done ? 'line-through' : ''}`}>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[i.food_type]}`} aria-label={t(`site.foodType.${i.food_type}`)} />
                  {i.name}
                </span>
                {(i.variant_name || i.addons) && <span className="block text-sm text-[#d6cfc6]">{[i.variant_name, i.addons].filter(Boolean).join(' · ')}</span>}
                {i.notes && <span className="mt-1 block rounded bg-[#fde68a] px-2 py-0.5 text-sm font-bold text-[#422006]">{i.notes}</span>}
              </span>
              {i.done && <Check className="h-5 w-5 text-[#4ade80]" aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ul>
      {ticket.notes && <p className="mx-3 mb-2 rounded-lg bg-[#fde68a] px-3 py-2 text-sm font-bold text-[#422006]">{ticket.notes}</p>}
      {next && (
        <button
          type="button"
          disabled={move.isPending}
          onClick={() => move.mutate(next)}
          className={`m-3 min-h-14 rounded-xl text-lg font-extrabold uppercase tracking-wide ${next === 'preparing' ? 'bg-[#f59e0b] text-[#1c1206]' : next === 'ready' ? 'bg-[#22c55e] text-[#052e16]' : 'bg-[#e7e2dc] text-[#1c1916]'}`}
        >
          {t(`kds.action.${next}`)}
        </button>
      )}
    </li>
  );
}

/** Full-screen kitchen screen. Works on a TV, tablet or phone; dark for a bright kitchen. */
export default function KitchenDisplay() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const can = useCan('kot.update');
  const hasKds = useFeature('kds');
  const connected = useLiveStatus((s) => s.connected);
  const sound = useAlertPrefs((s) => s.sound);
  const setSound = useAlertPrefs((s) => s.setSound);
  const interval = usePollInterval(8_000);
  const now = useNow();
  const seen = useRef<Set<number> | null>(null);
  const [recall, setRecall] = useState(false);
  const board = useQuery({
    queryKey: ['kds'],
    queryFn: async () => (await api.get<{ tickets: Ticket[]; served: Ticket[] }>('/tenant/kitchen/tickets')).data,
    enabled: can && hasKds,
    refetchInterval: interval,
    refetchIntervalInBackground: true,
  });
  useLive(session?.tenant?.id, 'kitchen', can && hasKds, () => void qc.invalidateQueries({ queryKey: ['kds'] }));

  // Chime for tickets that weren't on the screen before.
  useEffect(() => {
    const ids = new Set((board.data?.tickets ?? []).map((k) => k.id));
    if (seen.current && [...ids].some((id) => !seen.current!.has(id)) && sound) playChime();
    if (board.data) seen.current = ids;
  }, [board.data, sound]);

  const recallMutation = useMutation<unknown, ApiError, number>({
    mutationFn: (id) => api.post(`/tenant/kitchen/tickets/${id}/status`, { status: 'ready' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kds'] });
      setRecall(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const tickets = board.data?.tickets ?? [];
  const columns: { key: Ticket['status']; title: string }[] = [
    { key: 'new', title: t('kds.col.new') },
    { key: 'preparing', title: t('kds.col.preparing') },
    { key: 'ready', title: t('kds.col.ready') },
  ];

  return (
    <div className="min-h-screen bg-[#0f0d0b] text-[#f5f1ec]">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-[#2a2520] bg-[#0f0d0b]/95 px-4 py-3 backdrop-blur">
        <Link to="/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold hover:bg-white/10" aria-label={t('kds.back')}>
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <h1 className="text-xl font-extrabold">{t('kds.title')}</h1>
        <span className="text-sm text-[#bfb6ab]">{session?.tenant?.name}</span>
        <span className={`ml-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${connected ? 'bg-[#14532d] text-[#bbf7d0]' : 'bg-[#3a342e] text-[#d6cfc6]'}`}>
          {connected ? <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />}
          {connected ? t('kds.live') : t('kds.polling')}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-lg font-bold tabular-nums">{new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(now)}</span>
          <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-white/10" onClick={() => setRecall(!recall)} aria-expanded={recall}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> {t('kds.recall')}
          </button>
          <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10" onClick={() => { setSound(!sound); if (!sound) playChime(); }} aria-pressed={sound} aria-label={sound ? t('orders.soundOn') : t('orders.soundOff')}>
            {sound ? <Bell className="h-5 w-5" aria-hidden="true" /> : <BellOff className="h-5 w-5" aria-hidden="true" />}
          </button>
          <button type="button" className="hidden h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10 sm:inline-flex" onClick={() => void document.documentElement.requestFullscreen?.()} aria-label={t('kds.fullscreen')}>
            <Maximize className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {!can || !hasKds ? (
        <p className="p-8 text-center text-lg">{!hasKds ? t('kds.noPlan') : t('kds.noAccess')}</p>
      ) : (
        <>
          {recall && (
            <div className="border-b border-[#2a2520] bg-[#1c1916] px-4 py-3">
              <p className="mb-2 text-sm text-[#bfb6ab]">{t('kds.recallHint')}</p>
              <div className="flex flex-wrap gap-2">
                {(board.data?.served ?? []).length === 0 && <span className="text-sm">{t('kds.nothingServed')}</span>}
                {(board.data?.served ?? []).map((k) => (
                  <button key={k.id} type="button" className="rounded-lg bg-[#2a2520] px-3 py-2 text-sm font-semibold hover:bg-[#3a342e]" onClick={() => recallMutation.mutate(k.id)}>
                    K-{k.number} · {k.table_label ?? t(`order.type.${k.order_type}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <main className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-3">
            {columns.map((c) => {
              const list = tickets.filter((k) => k.status === c.key);
              return (
                <section key={c.key} aria-labelledby={`col-${c.key}`} className="min-w-0">
                  <h2 id={`col-${c.key}`} className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#bfb6ab]">
                    {c.title} <span className="rounded-full bg-[#2a2520] px-2 py-0.5 text-[#f5f1ec] tabular-nums">{list.length}</span>
                  </h2>
                  {list.length === 0 && <p className="rounded-2xl border border-dashed border-[#3a342e] p-6 text-center text-sm text-[#8c8377]">{t('kds.empty')}</p>}
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    {list.map((k) => (
                      <TicketCard key={k.id} ticket={k} now={now} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </main>
        </>
      )}
    </div>
  );
}
