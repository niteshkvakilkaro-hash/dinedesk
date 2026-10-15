import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Banknote, Bike, CheckCircle2, LocateFixed, LocateOff, LogOut, MapPin, Navigation, Package, Phone, UserRound } from 'lucide-react';
import i18n from 'i18next';
import { api, API_BASE, ApiError } from '@/lib/api';
import { formatINR } from '@/lib/format';
import { languageCode } from '@/i18n/locale';
import { disconnectLive } from '@/lib/realtime';
import { useCan, useFeature, useSaveLanguage, useSession, useSignOut } from '@/hooks/useSession';
import { Alert, Badge, EmptyState, ErrorState, SkeletonRows, Spinner, toast } from '@/components/ui';
import { LanguageToggle } from '@/components/Brand';
import type { OrderStatus } from '@/site/types';
import { createLocationSharing, nativeLocationBridge, SendError, uploadUrl, type LocationSharing, type SharingStatus } from './locationSharing';
import { agoText, directionsUrl } from './time';

interface RiderOrder {
  id: number;
  number: number;
  status: OrderStatus;
  customer_name: string;
  customer_phone: string | null;
  address: { line1: string | null; line2: string | null; landmark: string | null; pincode: string | null; lat: number | null; lng: number | null } | null;
  notes: string | null;
  items_count: number;
  total: string;
  payment_method: string;
  payment_status: string;
  collect: string | null;
  placed_at: string;
  scheduled_for: string | null;
  next: 'out_for_delivery' | 'completed' | null;
}

interface RiderState {
  on_duty: boolean;
  duty_started_at: string | null;
  last_sent_at: string | null;
  interval_sec: number;
  orders: RiderOrder[];
  sharing?: { token: string; expires_at: string; interval_sec: number } | null;
}

async function batteryLevel(): Promise<number | null> {
  const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> };
  if (!nav.getBattery) return null;
  return Math.round((await nav.getBattery()).level * 100);
}

/** One sharing controller for the screen: the app's background service when there is one, else this browser tab. */
function useSharing(intervalSec: number | undefined) {
  const [status, setStatus] = useState<SharingStatus | null>(null);
  const ref = useRef<LocationSharing | null>(null);
  const sharing = useMemo(() => {
    if (!intervalSec) return null;
    return createLocationSharing({
      bridge: nativeLocationBridge(),
      geolocation: typeof navigator !== 'undefined' && 'geolocation' in navigator ? navigator.geolocation : null,
      secure: typeof window !== 'undefined' ? window.isSecureContext : true,
      intervalSec,
      native: { uploadUrl: uploadUrl(API_BASE, window.location.href), tenantHost: window.location.host, locale: languageCode(i18n.language) },
      battery: batteryLevel,
      send: async (points) => {
        try {
          return (await api.post<{ on_duty: boolean }>('/tenant/rider/locations', { points })).data;
        } catch (e) {
          throw new SendError(e instanceof ApiError ? e.status : 0);
        }
      },
      onChange: setStatus,
    });
  }, [intervalSec]);
  ref.current = sharing;
  // The browser's timer stops with the screen; the app's service keeps going in the background.
  useEffect(() => () => sharing?.mode === 'web' ? sharing.stop() : undefined, [sharing]);
  // Refresh "last sent" (the app reports its own) and the minutes shown.
  const refresh = useCallback(() => setStatus(ref.current?.status() ?? null), []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh, sharing]);
  return { sharing, status, refresh };
}

function SharingLine({ state, status, mode }: { state: RiderState; status: SharingStatus | null; mode: LocationSharing['mode'] | undefined }) {
  const { t } = useTranslation();
  // The newest of what this phone says and what the server received.
  const times = [status?.lastSentAt, state.last_sent_at].filter((x): x is string => !!x).sort();
  const last = times.at(-1) ?? null;
  const error = status?.lastError;
  if (!state.on_duty) {
    return (
      <p className="flex items-center gap-2 text-sm text-white/75">
        <LocateOff className="h-4 w-4 shrink-0" aria-hidden="true" /> {t('rider.notSharing')}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-semibold" aria-live="polite">
        <LocateFixed className={`h-4 w-4 shrink-0 ${error ? 'text-[#fbbf24]' : 'text-[#4ade80]'}`} aria-hidden="true" />
        {last ? t('rider.lastSent', { ago: agoText(t, last) }) : t('rider.waitingFirst')}
      </p>
      {error && <p className="rounded-lg bg-white/10 px-3 py-2 text-sm">{t(`rider.error.${error}`, { defaultValue: t('rider.error.position') })}</p>}
      <p className="text-xs text-white/70">{mode === 'native' ? t('rider.modeApp', { minutes: Math.round(state.interval_sec / 60) }) : t('rider.modeWeb', { minutes: Math.round(state.interval_sec / 60) })}</p>
    </div>
  );
}

function OrderCard({ o, busy, onMove }: { o: RiderOrder; busy: boolean; onMove: (status: 'out_for_delivery' | 'completed') => void }) {
  const { t } = useTranslation();
  const a = o.address;
  const maps = directionsUrl(a);
  return (
    <li className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="text-2xl font-extrabold tabular-nums">#{o.number}</span>
        <Badge tone={o.status}>{t(`order.status.${o.status}`)}</Badge>
        <span className="ml-auto text-xs text-muted">{agoText(t, o.placed_at)}</span>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">{o.customer_name}</p>
            {a && <p className="text-sm">{[a.line1, a.line2, a.landmark].filter(Boolean).join(', ')}{a.pincode && <span className="font-mono"> · {a.pincode}</span>}</p>}
          </div>
          {o.customer_phone && (
            <a href={`tel:${o.customer_phone}`} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-success text-white" aria-label={t('rider.call', { name: o.customer_name })}>
              <Phone className="h-6 w-6" aria-hidden="true" />
            </a>
          )}
        </div>
        {o.notes && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">{t('orders.orderNote', { note: o.notes })}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5"><Package className="h-4 w-4 text-muted" aria-hidden="true" />{t('orders.itemsCount', { count: o.items_count })}</span>
          {o.collect ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1 text-base font-extrabold text-warn">
              <Banknote className="h-5 w-5" aria-hidden="true" /> {t('rider.collect', { amount: formatINR(o.collect) })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-semibold text-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{t('rider.paid')}</span>
          )}
        </div>
        {maps && (
          <a href={maps} target="_blank" rel="noopener noreferrer" className="btn-outline w-full">
            <MapPin className="h-5 w-5" aria-hidden="true" /> {t('rider.openMaps')}
          </a>
        )}
        {o.next === 'out_for_delivery' && (
          <button type="button" className="btn-brand w-full !min-h-14 text-lg" disabled={busy} onClick={() => onMove('out_for_delivery')}>
            {busy ? <Spinner /> : <><Bike className="h-6 w-6" aria-hidden="true" /> {t('rider.pickedUp')}</>}
          </button>
        )}
        {o.next === 'completed' && (
          <button type="button" className="btn-primary w-full !min-h-14 text-lg" disabled={busy} onClick={() => onMove('completed')}>
            {busy ? <Spinner /> : <><CheckCircle2 className="h-6 w-6" aria-hidden="true" /> {o.collect ? t('rider.deliveredCollected', { amount: formatINR(o.collect) }) : t('rider.delivered')}</>}
          </button>
        )}
        {!o.next && <p className="rounded-xl bg-paper px-4 py-3 text-center text-sm font-semibold text-muted">{t('rider.notReady')}</p>}
      </div>
    </li>
  );
}

/** Phone screen for delivery riders: duty on/off with location sharing, their deliveries, picked up / delivered. */
export default function RiderApp() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const canRide = useCan('deliveries.run');
  const hasOrdering = useFeature('online_ordering');
  const allowed = canRide && hasOrdering;
  const signOut = useSignOut();
  const saveLanguage = useSaveLanguage();
  const query = useQuery({
    queryKey: ['rider'],
    queryFn: async () => (await api.get<RiderState>('/tenant/rider')).data,
    enabled: allowed,
    refetchInterval: 30_000,
  });
  const state = query.data;
  const { sharing, status, refresh } = useSharing(state?.interval_sec);
  const startedFor = useRef<string | null>(null);

  const duty = useMutation<RiderState, ApiError, boolean>({
    mutationFn: async (on) => (await api.post<RiderState>('/tenant/rider/duty', { on })).data,
    onSuccess: (res, on) => {
      qc.setQueryData(['rider'], { ...res, sharing: undefined });
      if (!sharing) return;
      if (on) {
        startedFor.current = res.duty_started_at;
        sharing.start(res.sharing ? { token: res.sharing.token, expiresAt: res.sharing.expires_at } : undefined);
        void sharing.sendNow();
      } else {
        sharing.stop();
      }
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  // Back on this screen while on duty: make sure sharing runs (the app may have been restarted).
  useEffect(() => {
    if (!state || !sharing || duty.isPending) return;
    if (!state.on_duty) {
      if (sharing.status().running) sharing.stop();
      startedFor.current = null;
      return;
    }
    if (startedFor.current === state.duty_started_at && sharing.status().running) return;
    startedFor.current = state.duty_started_at;
    if (sharing.mode === 'web') sharing.start();
    // The app needs a fresh upload token; asking for duty again gives one (still the same duty).
    else if (sharing.mode === 'native' && !sharing.status().running) duty.mutate(true);
  }, [state?.on_duty, state?.duty_started_at, sharing]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = useMutation<RiderState, ApiError, { id: number; status: 'out_for_delivery' | 'completed' }>({
    mutationFn: async ({ id, status }) => (await api.post<RiderState>(`/tenant/rider/orders/${id}/status`, { status })).data,
    onSuccess: (res, v) => {
      qc.setQueryData(['rider'], res);
      toast.success(v.status === 'completed' ? t('rider.doneToast') : t('rider.outToast'));
      // A position with each step, so the restaurant and the guest see it at once.
      if (res.on_duty) void sharing?.sendNow();
    },
    onError: (e) => toast.error(e.message),
  });

  const leave = async () => {
    if (state?.on_duty) {
      sharing?.stop();
      await api.post('/tenant/rider/duty', { on: false }).catch(() => undefined);
    }
    disconnectLive();
    await signOut();
  };

  const startedAt = state?.duty_started_at ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(state.duty_started_at)) : null;
  const unavailable = sharing?.mode === 'unavailable';

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-[#14110F] px-4 text-white">
        <Bike className="h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold leading-tight">{t('rider.title')}</p>
          <p className="truncate text-xs opacity-80">{session?.tenant?.name}</p>
        </div>
        <LanguageToggle light onPick={(code) => void saveLanguage(code).catch(() => undefined)} />
        <Link to="/dashboard/account" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10" aria-label={t('dashboard.nav.account')}>
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </Link>
        <button type="button" onClick={() => void leave()} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10" aria-label={t('common.signOut')}>
          <LogOut className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      {!allowed ? (
        <p className="p-6 text-center">{t('rider.noAccess')}</p>
      ) : query.isError ? (
        <div className="p-4"><ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} /></div>
      ) : !state ? (
        <div className="p-4"><SkeletonRows rows={3} /></div>
      ) : (
        <main className="mx-auto max-w-xl space-y-4 p-4 pb-10">
          <section className={`rounded-2xl p-4 text-white ${state.on_duty ? 'bg-[#14532d]' : 'bg-[#3f3a35]'}`} aria-labelledby="duty-h">
            <div className="flex items-center gap-3">
              <span className={`h-3 w-3 shrink-0 rounded-full ${state.on_duty ? 'animate-pulse bg-[#4ade80]' : 'bg-white/40'}`} aria-hidden="true" />
              <h1 id="duty-h" className="flex-1 text-xl font-extrabold">{state.on_duty ? t('rider.onDuty') : t('rider.offDuty')}</h1>
              {state.on_duty && startedAt && <span className="text-sm text-white/75">{t('rider.since', { time: startedAt })}</span>}
            </div>
            <div className="mt-3">
              <SharingLine state={state} status={status} mode={sharing?.mode} />
            </div>
            <button
              type="button"
              className={`mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl text-lg font-extrabold ${state.on_duty ? 'bg-white text-[#14532d]' : 'bg-[#4ade80] text-[#14110f]'}`}
              disabled={duty.isPending || (!state.on_duty && unavailable)}
              aria-pressed={state.on_duty}
              onClick={() => duty.mutate(!state.on_duty)}
            >
              {duty.isPending ? <Spinner /> : <><Navigation className="h-5 w-5" aria-hidden="true" /> {state.on_duty ? t('rider.endDuty') : t('rider.startDuty')}</>}
            </button>
            {!state.on_duty && <p className="mt-2 text-xs text-white/75">{t('rider.privacy')}</p>}
          </section>
          {unavailable && <Alert tone="warn">{t(`rider.error.${status?.lastError ?? 'unsupported'}`)}</Alert>}

          <h2 className="pt-2 text-sm font-bold uppercase tracking-wider text-muted">{t('rider.myDeliveries', { n: state.orders.length })}</h2>
          {state.orders.length === 0 ? (
            <EmptyState title={t('rider.empty')}>{t('rider.emptyHint')}</EmptyState>
          ) : (
            <ul className="space-y-4">
              {state.orders.map((o) => (
                <OrderCard key={o.id} o={o} busy={move.isPending && move.variables?.id === o.id} onMove={(s) => move.mutate({ id: o.id, status: s })} />
              ))}
            </ul>
          )}
        </main>
      )}
    </div>
  );
}
