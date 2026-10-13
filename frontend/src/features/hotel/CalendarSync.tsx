import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Copy, RefreshCw, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Alert, Dialog, Field, SkeletonRows, Spinner, toast } from '@/components/ui';
import type { RoomTypeRow } from './api';

interface Sync {
  type_id: number;
  export_url: string;
  feeds: { id: number; name: string; synced_at: string | null; error: string | null; events: number; link: string }[];
}

const SITES = ['Airbnb', 'Booking.com', 'Agoda', 'Vrbo', 'Other'];

/**
 * Calendar sync (iCal) for one room type: the private link booking sites read (nights with no
 * room free close there), and the sites' links (their bookings hold a room here).
 */
export function CalendarSyncDialog({ type, onClose }: { type: RoomTypeRow | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const key = ['hotel', 'calendar-sync', type?.id];
  const q = useQuery({ queryKey: key, queryFn: async () => (await api.get<Sync>(`/tenant/hotel/types/${type!.id}/calendar-sync`)).data, enabled: !!type });
  const [form, setForm] = useState({ name: 'Airbnb', url: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const after = (res: { data: Sync; message?: string | null }) => {
    qc.setQueryData(key, res.data);
    void qc.invalidateQueries({ queryKey: ['hotel'] });
    if (res.message) toast.success(res.message);
  };
  const add = useMutation<{ data: Sync; message?: string | null }, ApiError>({
    mutationFn: () => api.post<Sync>(`/tenant/hotel/types/${type!.id}/calendar-sync/feeds`, form),
    onSuccess: (res) => {
      after(res);
      setForm({ name: 'Airbnb', url: '' });
      setErrors({});
    },
    onError: (e) => setErrors(e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])) : { url: e.message }),
  });
  const act = useMutation<{ data: Sync; message?: string | null }, ApiError, 'sync' | 'renew' | number>({
    mutationFn: (what) => (typeof what === 'number' ? api.delete<Sync>(`/tenant/hotel/calendar-feeds/${what}`) : api.post<Sync>(`/tenant/hotel/types/${type!.id}/calendar-sync/${what}`)),
    onSuccess: after,
    onError: (e) => toast.error(e.message),
  });
  if (!type) return null;
  const d = q.data;
  const when = (iso: string) => new Date(iso).toLocaleString(i18n.language?.startsWith('hi') ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

  return (
    <Dialog open onClose={onClose} title={t('hotel.sync.title', { name: type.name })} wide>
      {!d ? <SkeletonRows rows={3} /> : (
        <div className="space-y-6">
          <p className="text-sm text-muted">{t('hotel.sync.intro')}</p>

          <section className="space-y-2">
            <h3 className="font-bold">{t('hotel.sync.outTitle')}</h3>
            <p className="text-sm text-muted">{t('hotel.sync.outHint')}</p>
            <div className="flex gap-2">
              <input readOnly className="field-input font-mono text-xs" value={d.export_url} aria-label={t('hotel.sync.outTitle')} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn-outline !min-h-11 shrink-0" onClick={() => void navigator.clipboard?.writeText(d.export_url).then(() => toast.success(t('hotel.sync.copied')))}>
                <Copy className="h-4 w-4" aria-hidden="true" /> {t('hotel.sync.copy')}
              </button>
            </div>
            <button type="button" className="text-sm font-semibold text-danger underline" onClick={() => window.confirm(t('hotel.sync.renewConfirm')) && act.mutate('renew')}>{t('hotel.sync.renew')}</button>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold">{t('hotel.sync.inTitle')}</h3>
              {d.feeds.length > 0 && (
                <button type="button" className="btn-ghost !min-h-9 text-sm" disabled={act.isPending} onClick={() => act.mutate('sync')}>
                  {act.isPending ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />} {t('hotel.sync.syncNow')}
                </button>
              )}
            </div>
            <p className="text-sm text-muted">{t('hotel.sync.inHint')}</p>
            {d.feeds.length > 0 && (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {d.feeds.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{f.name}</span> <span className="text-muted">{f.link}</span>
                      <span className={`block text-xs ${f.error ? 'font-semibold text-danger' : 'text-muted'}`}>
                        {f.error ?? (f.synced_at ? t('hotel.sync.synced', { when: when(f.synced_at), count: f.events }) : t('hotel.sync.notYet'))}
                      </span>
                    </span>
                    <button type="button" className="btn-ghost !min-h-9 !px-2 text-danger" onClick={() => window.confirm(t('hotel.sync.removeConfirm', { name: f.name })) && act.mutate(f.id)} aria-label={t('common.remove')}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); add.mutate(); }} noValidate>
              <Field label={t('hotel.sync.site')}>{(a) => <select {...a} className="field-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}>{SITES.map((s) => <option key={s} value={s}>{s === 'Other' ? t('hotel.sync.other') : s}</option>)}</select>}</Field>
              <Field label={t('hotel.sync.link')} error={errors.url ?? errors.name}>{(a) => <input {...a} type="url" inputMode="url" className="field-input" placeholder="https://…/calendar.ics" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />}</Field>
              <button type="submit" className="btn-primary !min-h-11" disabled={!form.url || add.isPending}>{add.isPending ? <Spinner /> : t('hotel.sync.add')}</button>
            </form>
          </section>

          <Alert tone="info">{t('hotel.sync.which')}</Alert>
        </div>
      )}
    </Dialog>
  );
}
