import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Copy, Crosshair, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatINR } from '@/lib/format';
import { Alert, Badge, DemoBadge, Dialog, ErrorState, Field, SkeletonRows, Spinner, toast, Toggle } from '@/components/ui';

interface OrderingSettings {
  accepting_orders: boolean;
  types: { delivery: boolean; takeaway: boolean; dine_in: boolean };
  payments: { online: boolean; cod: boolean; counter: boolean };
  default_tax_rate: number;
  prices_include_tax: boolean;
  packaging_fee: number;
  prep_minutes: number;
  delivery_minutes: number;
  scheduling: { enabled: boolean; max_days: number };
  location: { lat: number | null; lng: number | null };
  notifications: { email: boolean; whatsapp: boolean; sms: boolean };
}

interface Zone {
  id: number;
  name: string;
  type: 'pincode' | 'radius';
  pincodes: string[];
  radius_km: string | null;
  fee: string;
  min_order: string;
  free_above: string | null;
  is_active: boolean;
  is_demo: boolean;
}

interface Payload {
  settings: OrderingSettings;
  razorpay: { key_id: string | null; has_key_secret: boolean; has_webhook_secret: boolean; mode: 'test' | 'live' | null; webhook_url: string };
  zones: Zone[];
  site_host: string;
}

function ZoneEditor({ zone, onClose }: { zone: Zone | 'new'; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const z = zone === 'new' ? null : zone;
  const [form, setForm] = useState({
    name: z?.name ?? '',
    type: z?.type ?? 'pincode',
    pincodes: (z?.pincodes ?? []).join(', '),
    radius_km: z?.radius_km ?? '3',
    fee: z?.fee ?? '30',
    min_order: z?.min_order ?? '0',
    free_above: z?.free_above ?? '',
    is_active: z?.is_active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation<{ data: Payload }, ApiError>({
    mutationFn: () => {
      const body = { ...form, pincodes: form.pincodes.split(/[\s,]+/).filter(Boolean), radius_km: form.type === 'radius' ? form.radius_km : null, free_above: form.free_above === '' ? null : form.free_above };
      return z ? api.put<Payload>(`/tenant/ordering/zones/${z.id}`, body) : api.post<Payload>('/tenant/ordering/zones', body);
    },
    onSuccess: (res) => {
      qc.setQueryData(['ordering'], res.data);
      toast.success(t('orderingAdmin.zoneSaved'));
      onClose();
    },
    onError: (e) => setErrors(e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k.startsWith('pincodes') ? 'pincodes' : k, v[0]])) : { name: e.message }),
  });
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Dialog open onClose={onClose} title={z ? t('orderingAdmin.editZone') : t('orderingAdmin.addZone')}>
      <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label={t('orderingAdmin.zoneName')} hint={t('orderingAdmin.zoneNameHint')} error={errors.name}>
          {(a) => <input {...a} className="field-input" value={form.name} maxLength={80} onChange={(e) => set('name', e.target.value)} data-autofocus />}
        </Field>
        <fieldset>
          <legend className="field-label">{t('orderingAdmin.zoneBy')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['pincode', 'radius'] as const).map((ty) => (
              <label key={ty} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold ${form.type === ty ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
                <input type="radio" name="zone-type" className="sr-only" checked={form.type === ty} onChange={() => set('type', ty)} />
                {t(`orderingAdmin.by.${ty}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {form.type === 'pincode' ? (
          <Field label={t('orderingAdmin.pincodes')} hint={t('orderingAdmin.pincodesHint')} error={errors.pincodes}>
            {(a) => <textarea {...a} rows={2} className="field-input font-mono" value={form.pincodes} onChange={(e) => set('pincodes', e.target.value)} />}
          </Field>
        ) : (
          <Field label={t('orderingAdmin.radius')} hint={t('orderingAdmin.radiusHint')} error={errors.radius_km}>
            {(a) => <input {...a} type="number" min={0.5} max={50} step="0.5" className="field-input max-w-[160px]" value={form.radius_km} onChange={(e) => set('radius_km', e.target.value)} />}
          </Field>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('orderingAdmin.fee')} error={errors.fee}>{(a) => <input {...a} type="number" min={0} className="field-input" value={form.fee} onChange={(e) => set('fee', e.target.value)} />}</Field>
          <Field label={t('orderingAdmin.minOrder')} error={errors.min_order}>{(a) => <input {...a} type="number" min={0} className="field-input" value={form.min_order} onChange={(e) => set('min_order', e.target.value)} />}</Field>
          <Field label={t('orderingAdmin.freeAbove')} optional error={errors.free_above}>{(a) => <input {...a} type="number" min={0} className="field-input" value={form.free_above} onChange={(e) => set('free_above', e.target.value)} />}</Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} /> {t('orderingAdmin.zoneActive')}
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button>
        </div>
      </form>
    </Dialog>
  );
}

export default function OrderingSettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['ordering'], queryFn: async () => (await api.get<Payload>('/tenant/ordering')).data });
  const [s, setS] = useState<OrderingSettings | null>(null);
  const [rzp, setRzp] = useState({ key_id: '', key_secret: '', webhook_secret: '' });
  const [zone, setZone] = useState<Zone | 'new' | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (query.data) {
      setS(query.data.settings);
      setRzp({ key_id: query.data.razorpay.key_id ?? '', key_secret: '', webhook_secret: '' });
    }
  }, [query.data]);

  const save = useMutation<{ data: Payload }, ApiError, OrderingSettings>({
    mutationFn: (body) => api.put<Payload>('/tenant/ordering', body),
    onSuccess: (res) => {
      qc.setQueryData(['ordering'], res.data);
      void qc.invalidateQueries({ queryKey: ['site'] });
      toast.success(t('orderingAdmin.saved'));
    },
    onError: (e) => toast.error(e.message),
  });
  const saveRzp = useMutation<{ data: Payload }, ApiError, typeof rzp>({
    mutationFn: (body) => api.put<Payload>('/tenant/ordering/razorpay', { key_id: body.key_id || null, key_secret: body.key_secret || null, webhook_secret: body.webhook_secret || null }),
    onSuccess: (res) => {
      qc.setQueryData(['ordering'], res.data);
      toast.success(res.data.razorpay.key_id ? t('orderingAdmin.rzpConnected') : t('orderingAdmin.rzpDisconnected'));
    },
    onError: (e) => toast.error(e.message),
  });
  const removeZone = useMutation<{ data: Payload }, ApiError, number>({
    mutationFn: (id) => api.delete<Payload>(`/tenant/ordering/zones/${id}`),
    onSuccess: (res) => qc.setQueryData(['ordering'], res.data),
  });

  if (query.isError) return <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />;
  if (!query.data || !s) return <SkeletonRows rows={8} />;
  const data = query.data;
  const up = (patch: Partial<OrderingSettings>) => setS({ ...s, ...patch });
  const noType = !s.types.delivery && !s.types.takeaway && !s.types.dine_in;
  const onlineWithoutKeys = s.payments.online && !data.razorpay.has_key_secret;

  return (
    <form className="max-w-3xl space-y-6" noValidate onSubmit={(e) => { e.preventDefault(); save.mutate(s); }}>
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{t('orderingAdmin.title')}</h1>
        <p className="text-muted">{t('orderingAdmin.subtitle')}</p>
      </div>

      <section className={`card p-5 ${s.accepting_orders ? '!border-success' : ''}`}>
        <Toggle checked={s.accepting_orders} onChange={(v) => up({ accepting_orders: v })} label={t('orderingAdmin.accepting')} hint={s.accepting_orders ? t('orderingAdmin.acceptingOn', { host: data.site_host }) : t('orderingAdmin.acceptingOff')} />
      </section>

      <section className="card p-5" aria-labelledby="types-h">
        <h2 id="types-h" className="text-lg font-bold">{t('orderingAdmin.types')}</h2>
        <div className="divide-y divide-line">
          <Toggle checked={s.types.delivery} onChange={(v) => up({ types: { ...s.types, delivery: v } })} label={t('order.type.delivery')} hint={t('orderingAdmin.deliveryHint')} />
          <Toggle checked={s.types.takeaway} onChange={(v) => up({ types: { ...s.types, takeaway: v } })} label={t('order.type.takeaway')} />
          <Toggle checked={s.types.dine_in} onChange={(v) => up({ types: { ...s.types, dine_in: v } })} label={t('order.type.dine_in')} hint={t('orderingAdmin.dineInHint')} />
        </div>
        {noType && <Alert tone="warn">{t('orderingAdmin.noType')}</Alert>}
      </section>

      <section className="card p-5" aria-labelledby="pay-h">
        <h2 id="pay-h" className="text-lg font-bold">{t('orderingAdmin.payments')}</h2>
        <div className="divide-y divide-line">
          <Toggle checked={s.payments.cod} onChange={(v) => up({ payments: { ...s.payments, cod: v } })} label={t('order.pay.cod')} hint={t('orderingAdmin.codHint')} />
          <Toggle checked={s.payments.counter} onChange={(v) => up({ payments: { ...s.payments, counter: v } })} label={t('order.pay.counter')} hint={t('orderingAdmin.counterHint')} />
          <Toggle checked={s.payments.online} onChange={(v) => up({ payments: { ...s.payments, online: v } })} label={t('order.pay.online')} hint={t('orderingAdmin.onlineHint')} />
        </div>
        {onlineWithoutKeys && <Alert tone="warn">{t('orderingAdmin.needKeys')}</Alert>}

        <div className="mt-4 space-y-4 rounded-xl bg-paper p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">Razorpay</h3>
            {data.razorpay.mode ? <Badge tone={data.razorpay.mode === 'live' ? 'live' : 'trialing'}>{t(`orderingAdmin.mode.${data.razorpay.mode}`)}</Badge> : <Badge tone="neutral">{t('orderingAdmin.notConnected')}</Badge>}
          </div>
          <p className="text-sm text-muted">{t('orderingAdmin.rzpHint')}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Key ID">{(a) => <input {...a} className="field-input font-mono" placeholder="rzp_test_…" value={rzp.key_id} onChange={(e) => setRzp({ ...rzp, key_id: e.target.value.trim() })} autoComplete="off" />}</Field>
            <Field label="Key secret" hint={data.razorpay.has_key_secret ? t('orderingAdmin.secretSaved') : undefined}>{(a) => <input {...a} type="password" className="field-input font-mono" value={rzp.key_secret} onChange={(e) => setRzp({ ...rzp, key_secret: e.target.value.trim() })} autoComplete="new-password" />}</Field>
            <Field label="Webhook secret" hint={data.razorpay.has_webhook_secret ? t('orderingAdmin.secretSaved') : t('orderingAdmin.webhookSecretHint')}>{(a) => <input {...a} type="password" className="field-input font-mono" value={rzp.webhook_secret} onChange={(e) => setRzp({ ...rzp, webhook_secret: e.target.value.trim() })} autoComplete="new-password" />}</Field>
            <div>
              <p className="field-label">{t('orderingAdmin.webhookUrl')}</p>
              <div className="flex gap-2">
                <code className="block min-w-0 flex-1 truncate rounded-xl border border-line bg-surface px-3 py-2.5 text-xs">{data.razorpay.webhook_url}</code>
                <button type="button" className="btn-outline !min-h-10 !px-3" onClick={() => void navigator.clipboard?.writeText(data.razorpay.webhook_url).then(() => toast.success(t('orderingAdmin.copied')))}>
                  <Copy className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{t('orderingAdmin.copy')}</span>
                </button>
              </div>
              <p className="mt-1 text-xs text-muted">{t('orderingAdmin.webhookEvents')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary !min-h-10 text-sm" disabled={saveRzp.isPending || !rzp.key_id} onClick={() => saveRzp.mutate(rzp)}>{saveRzp.isPending ? <Spinner /> : t('orderingAdmin.saveKeys')}</button>
            {data.razorpay.key_id && <button type="button" className="btn-ghost !min-h-10 text-sm text-danger" onClick={() => window.confirm(t('orderingAdmin.disconnectConfirm')) && saveRzp.mutate({ key_id: '', key_secret: '', webhook_secret: '' })}>{t('orderingAdmin.disconnect')}</button>}
          </div>
        </div>
      </section>

      <section className="card space-y-4 p-5" aria-labelledby="time-h">
        <h2 id="time-h" className="text-lg font-bold">{t('orderingAdmin.timing')}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('orderingAdmin.prep')} hint={t('orderingAdmin.minutes')}>{(a) => <input {...a} type="number" min={5} max={240} className="field-input" value={s.prep_minutes} onChange={(e) => up({ prep_minutes: Number(e.target.value) })} />}</Field>
          <Field label={t('orderingAdmin.deliveryTime')} hint={t('orderingAdmin.minutes')}>{(a) => <input {...a} type="number" min={5} max={240} className="field-input" value={s.delivery_minutes} onChange={(e) => up({ delivery_minutes: Number(e.target.value) })} />}</Field>
        </div>
        <Toggle checked={s.scheduling.enabled} onChange={(v) => up({ scheduling: { ...s.scheduling, enabled: v } })} label={t('orderingAdmin.scheduling')} hint={t('orderingAdmin.schedulingHint')} />
        {s.scheduling.enabled && (
          <Field label={t('orderingAdmin.maxDays')} className="max-w-[200px]">{(a) => <input {...a} type="number" min={0} max={7} className="field-input" value={s.scheduling.max_days} onChange={(e) => up({ scheduling: { ...s.scheduling, max_days: Number(e.target.value) } })} />}</Field>
        )}
      </section>

      <section className="card space-y-4 p-5" aria-labelledby="tax-h">
        <h2 id="tax-h" className="text-lg font-bold">{t('orderingAdmin.charges')}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('orderingAdmin.defaultGst')} hint={t('orderingAdmin.defaultGstHint')}>
            {(a) => (
              <select {...a} className="field-input" value={s.default_tax_rate} onChange={(e) => up({ default_tax_rate: Number(e.target.value) })}>
                {[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            )}
          </Field>
          <Field label={t('orderingAdmin.packaging')} hint={t('orderingAdmin.packagingHint')}>{(a) => <input {...a} type="number" min={0} max={1000} className="field-input" value={s.packaging_fee} onChange={(e) => up({ packaging_fee: Number(e.target.value) })} />}</Field>
        </div>
        <Toggle checked={s.prices_include_tax} onChange={(v) => up({ prices_include_tax: v })} label={t('orderingAdmin.inclusive')} hint={t('orderingAdmin.inclusiveHint')} />
      </section>

      <section className="card space-y-4 p-5" aria-labelledby="loc-h">
        <h2 id="loc-h" className="text-lg font-bold">{t('orderingAdmin.location')}</h2>
        <p className="text-sm text-muted">{t('orderingAdmin.locationHint')}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={t('orderingAdmin.lat')}>{(a) => <input {...a} type="number" step="0.000001" className="field-input" value={s.location.lat ?? ''} onChange={(e) => up({ location: { ...s.location, lat: e.target.value === '' ? null : Number(e.target.value) } })} />}</Field>
          <Field label={t('orderingAdmin.lng')}>{(a) => <input {...a} type="number" step="0.000001" className="field-input" value={s.location.lng ?? ''} onChange={(e) => up({ location: { ...s.location, lng: e.target.value === '' ? null : Number(e.target.value) } })} />}</Field>
          <button
            type="button"
            className="btn-outline"
            disabled={locating}
            onClick={() => {
              setLocating(true);
              navigator.geolocation?.getCurrentPosition(
                (p) => { up({ location: { lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) } }); setLocating(false); },
                () => { toast.error(t('orderingAdmin.locationFailed')); setLocating(false); },
                { timeout: 10_000 },
              );
            }}
          >
            {locating ? <Spinner className="h-4 w-4" /> : <Crosshair className="h-4 w-4" aria-hidden="true" />} {t('orderingAdmin.useLocation')}
          </button>
        </div>
      </section>

      <section className="card p-5" aria-labelledby="zones-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="zones-h" className="text-lg font-bold">{t('orderingAdmin.zones')}</h2>
          <button type="button" className="btn-outline !min-h-10 text-sm" onClick={() => setZone('new')}><Plus className="h-4 w-4" aria-hidden="true" /> {t('orderingAdmin.addZone')}</button>
        </div>
        {s.types.delivery && data.zones.filter((z) => z.is_active).length === 0 && <Alert tone="warn">{t('orderingAdmin.noZones')}</Alert>}
        <ul className="mt-3 divide-y divide-line">
          {data.zones.map((z) => (
            <li key={z.id} className="flex items-start gap-3 py-3">
              <MapPin className={`mt-1 h-5 w-5 shrink-0 ${z.is_active ? 'text-success' : 'text-muted'}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">{z.name} {z.is_demo && <DemoBadge />} {!z.is_active && <Badge tone="disabled">{t('orderingAdmin.off')}</Badge>}</p>
                <p className="text-sm text-muted">{z.type === 'pincode' ? z.pincodes.join(', ') : t('orderingAdmin.withinKm', { km: Number(z.radius_km) })}</p>
                <p className="text-sm">{t('orderingAdmin.zoneSummary', { fee: formatINR(z.fee), min: formatINR(z.min_order) })}{z.free_above && ` · ${t('orderingAdmin.freeOver', { amount: formatINR(z.free_above) })}`}</p>
              </div>
              <button type="button" className="btn-ghost !min-h-10 !px-2.5" onClick={() => setZone(z)}><Pencil className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{t('menuAdmin.editNamed', { name: z.name })}</span></button>
              <button type="button" className="btn-ghost !min-h-10 !px-2.5 text-danger" onClick={() => window.confirm(t('orderingAdmin.deleteZoneConfirm', { name: z.name })) && removeZone.mutate(z.id)}><Trash2 className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{t('menuAdmin.deleteNamed', { name: z.name })}</span></button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5" aria-labelledby="notify-h">
        <h2 id="notify-h" className="text-lg font-bold">{t('orderingAdmin.notifications')}</h2>
        <p className="text-sm text-muted">{t('orderingAdmin.notificationsHint')}</p>
        <div className="divide-y divide-line">
          <Toggle checked={s.notifications.email} onChange={(v) => up({ notifications: { ...s.notifications, email: v } })} label={t('orderingAdmin.email')} />
          <Toggle checked={s.notifications.whatsapp} onChange={(v) => up({ notifications: { ...s.notifications, whatsapp: v } })} label="WhatsApp" hint={t('orderingAdmin.providerHint')} />
          <Toggle checked={s.notifications.sms} onChange={(v) => up({ notifications: { ...s.notifications, sms: v } })} label="SMS" hint={t('orderingAdmin.providerHint')} />
        </div>
      </section>

      <div className="sticky bottom-20 z-10 flex justify-end rounded-card border border-line bg-surface/95 p-3 backdrop-blur lg:bottom-4">
        <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button>
      </div>
      {zone && <ZoneEditor key={zone === 'new' ? 'new' : zone.id} zone={zone} onClose={() => setZone(null)} />}
    </form>
  );
}
