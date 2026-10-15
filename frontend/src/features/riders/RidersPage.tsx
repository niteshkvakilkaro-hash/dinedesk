import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { BatteryMedium, Bike, MapPin, Phone, Route, UserPlus, X } from 'lucide-react';
import { formatINR } from '@/lib/format';
import { useLive } from '@/lib/realtime';
import { Link } from 'react-router';
import { useCan, useSession } from '@/hooks/useSession';
import { Alert, Badge, EmptyState, ErrorState, SkeletonRows } from '@/components/ui';
import type { MapMarker } from '@/components/MapView';
import { MapBoundary } from '@/components/MapBoundary';
import { agoText, isStale } from '@/features/rider/time';
import { useAssignRider, useRiders, useRiderTrail, type RiderRow } from './api';
import { RiderPicker } from './RiderPicker';

// Leaflet loads only here (and on the guest tracking page), never with the rest of the dashboard.
const MapView = lazy(() => import('@/components/MapView'));

function RiderCard({ r, selected, onSelect, staleMinutes }: { r: RiderRow; selected: boolean; onSelect: () => void; staleMinutes: number }) {
  const { t } = useTranslation();
  const assign = useAssignRider();
  const stale = isStale(r.last?.at, Date.now(), staleMinutes);
  return (
    <li className={`card p-4 ${selected ? 'ring-2 ring-brand' : ''}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${r.on_duty ? (stale ? 'bg-[#9ca3af]' : 'bg-[#16a34a]') : 'bg-line'}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{r.name}</p>
          <p className="text-sm text-muted">
            {r.on_duty ? t('riders.onDuty') : t('riders.offDuty')}
            {r.last && (
              <>
                {' · '}
                <span className={stale ? '' : 'font-semibold text-success'}>{t('riders.seen', { ago: agoText(t, r.last.at) })}</span>
              </>
            )}
            {r.last?.battery != null && (
              <span className="ml-2 inline-flex items-center gap-0.5 whitespace-nowrap">
                <BatteryMedium className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t('riders.battery')}</span>
                {r.last.battery}%
              </span>
            )}
          </p>
          {r.on_duty && stale && <p className="mt-1 text-xs font-semibold text-warn">{t('riders.staleHint', { minutes: staleMinutes })}</p>}
        </div>
        {r.phone && (
          <a href={`tel:${r.phone}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line" aria-label={t('rider.call', { name: r.name })}>
            <Phone className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
      </div>
      {r.orders.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {r.orders.map((o) => (
            <li key={o.id} className="flex items-center gap-2 rounded-lg bg-paper px-3 py-2 text-sm">
              <span className="font-bold tabular-nums">#{o.number}</span>
              <span className="min-w-0 flex-1 truncate">{o.customer_name} · {o.address}</span>
              <Badge tone={o.status}>{t(`order.status.${o.status}`)}</Badge>
              <button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-ink/5" disabled={assign.isPending} onClick={() => assign.mutate({ orderId: o.id, riderId: null })} aria-label={t('riders.unassign', { number: o.number })}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn-ghost mt-2 !min-h-10 !px-2 text-sm" aria-pressed={selected} disabled={!r.last} onClick={onSelect}>
        <Route className="h-4 w-4" aria-hidden="true" /> {selected ? t('riders.hideRoute') : t('riders.showRoute')}
      </button>
    </li>
  );
}

/** Dashboard → Riders: where each rider is, what they carry, today's route, and orders waiting for a rider. */
export default function RidersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const canTeam = useCan('staff.manage');
  const query = useRiders();
  const [selected, setSelected] = useState<number | null>(null);
  const trail = useRiderTrail(selected);
  // Live: a rider's new position, duty or assignment refreshes the map at once.
  useLive(session?.tenant?.id, 'riders', true, () => {
    void qc.invalidateQueries({ queryKey: ['riders'] });
    void qc.invalidateQueries({ queryKey: ['rider-trail'] });
  });

  const data = query.data;
  const riders = useMemo(() => data?.riders ?? [], [data]);
  const stale = data?.staleMinutes ?? 15;
  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = riders
      .filter((r) => r.last && (r.on_duty || r.id === selected))
      .map((r) => ({ id: r.id, lat: r.last!.lat, lng: r.last!.lng, label: `${r.name} · ${agoText(t, r.last!.at)}`, tone: isStale(r.last!.at, Date.now(), stale) ? 'stale' : 'live' }));
    const sel = riders.find((r) => r.id === selected);
    for (const o of sel?.orders ?? []) if (o.lat != null && o.lng != null) list.push({ id: `o${o.id}`, lat: o.lat, lng: o.lng, label: `#${o.number} · ${o.customer_name}`, tone: 'drop' });
    return list;
  }, [riders, selected, stale, t]);
  const path = useMemo(() => (trail.data ?? []).map((p) => [p.lat, p.lng] as [number, number]), [trail.data]);
  const onDuty = riders.filter((r) => r.on_duty).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{t('riders.title')}</h1>
        <p className="text-muted">{t('riders.subtitle', { minutes: Math.round((data?.intervalSec ?? 300) / 60) })}</p>
      </div>

      {query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />
      ) : query.isLoading || !data ? (
        <SkeletonRows rows={4} />
      ) : riders.length === 0 ? (
        <EmptyState title={t('riders.emptyTitle')} action={canTeam ? <Link to="/dashboard/team" className="btn-primary"><UserPlus className="h-4 w-4" aria-hidden="true" /> {t('riders.addRider')}</Link> : undefined}>
          {t('riders.emptyText')}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
          <section aria-labelledby="map-h" className="min-w-0 space-y-2 lg:sticky lg:top-20 lg:self-start">
            <h2 id="map-h" className="sr-only">{t('riders.map')}</h2>
            <MapBoundary fallback={<Alert tone="warn">{t('riders.mapFailed')}</Alert>}>
              <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-ink/5 sm:h-[480px]" />}>
                <MapView
                  label={t('riders.map')}
                  markers={markers}
                  trail={path}
                  fitKey={`${selected ?? 'all'}-${markers.length}-${path.length > 0}`}
                  className="h-72 rounded-xl border border-line sm:h-[480px]"
                  onSelect={(id) => typeof id === 'number' && setSelected(id === selected ? null : id)}
                />
              </Suspense>
            </MapBoundary>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#16a34a]" aria-hidden="true" />{t('riders.legendLive')}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#9ca3af]" aria-hidden="true" />{t('riders.legendStale', { minutes: stale })}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#c2410c]" aria-hidden="true" />{t('riders.legendDrop')}</span>
              {selected && <span className="inline-flex items-center gap-1.5"><span className="h-1 w-4 rounded bg-[#2563eb]" aria-hidden="true" />{t('riders.legendRoute')}</span>}
            </p>
            {onDuty === 0 && <p className="text-sm text-muted">{t('riders.noneOnDuty')}</p>}
          </section>

          <div className="space-y-5">
            <section aria-labelledby="riders-h">
              <h2 id="riders-h" className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted">
                <Bike className="h-4 w-4" aria-hidden="true" /> {t('riders.listTitle', { on: onDuty, total: riders.length })}
              </h2>
              <ul className="space-y-3">
                {riders.map((r) => (
                  <RiderCard key={r.id} r={r} staleMinutes={stale} selected={selected === r.id} onSelect={() => setSelected(selected === r.id ? null : r.id)} />
                ))}
              </ul>
            </section>

            <section aria-labelledby="waiting-h">
              <h2 id="waiting-h" className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted">
                <MapPin className="h-4 w-4" aria-hidden="true" /> {t('riders.waiting', { n: data.unassigned.length })}
              </h2>
              {data.unassigned.length === 0 ? (
                <p className="card p-4 text-sm text-muted">{t('riders.noneWaiting')}</p>
              ) : (
                <ul className="space-y-2">
                  {data.unassigned.map((o) => (
                    <li key={o.id} className="card flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="font-bold tabular-nums">#{o.number}</span> · {o.customer_name} · <span className="tabular-nums">{formatINR(o.total)}</span>
                        </p>
                        <p className="truncate text-xs text-muted">{o.address}</p>
                      </div>
                      <RiderPicker orderId={o.id} number={o.number} riders={riders} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

