import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/lib/api';
import { Alert, ErrorState, Field, SkeletonRows, Spinner, toast } from '@/components/ui';

interface PlatformSettings {
  seller: { legal_name: string | null; gstin: string | null; state_code: string | null; address: string | null; email: string | null; phone: string | null; invoice_prefix: string };
  billing: { grace_days: number; gst_rate: number; sac: string };
  razorpay_configured: boolean;
  webhook_url: string;
  domain_target: string;
}

/** Super admin → Settings: who invoices the subscriptions, GST, grace period. */
export default function PlatformSettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['platform', 'settings'], queryFn: async () => (await api.get<PlatformSettings>('/platform/settings')).data });
  const [f, setF] = useState<PlatformSettings | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);
  const save = useMutation<PlatformSettings, ApiError>({
    mutationFn: async () => (await api.put<PlatformSettings>('/platform/settings', { seller: f!.seller, billing: f!.billing })).data,
    onSuccess: (d) => { qc.setQueryData(['platform', 'settings'], d); setErrors({}); toast.success(t('common.saved')); },
    onError: (e) => setErrors(e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])) : { form: e.message }),
  });
  if (q.isLoading || !f) return q.isError ? <ErrorState message={(q.error as Error).message} /> : <SkeletonRows rows={6} />;
  const seller = (k: keyof PlatformSettings['seller'], label: string, props: Record<string, unknown> = {}) => (
    <Field label={label} optional error={errors[`seller.${k}`]}>{(a) => <input {...a} className="field-input" {...props} value={f.seller[k] ?? ''} onChange={(e) => setF({ ...f, seller: { ...f.seller, [k]: e.target.value } })} />}</Field>
  );
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{t('platform.settings.title')}</h1>
        <p className="text-muted">{t('platform.settings.subtitle')}</p>
      </div>
      {errors.form && <Alert>{errors.form}</Alert>}
      <section className="card space-y-2 p-5 text-sm">
        <h2 className="text-lg font-bold">{t('platform.settings.payments')}</h2>
        <p>{f.razorpay_configured ? t('platform.settings.razorpayOn') : t('platform.settings.razorpayOff')}</p>
        <p>{t('platform.settings.webhook')} <code className="break-all rounded bg-ink/5 px-1.5 py-0.5">{f.webhook_url}</code></p>
        <p className="text-muted">{t('platform.settings.webhookEvents')}</p>
        <p>{t('platform.settings.domainTarget')} <code className="rounded bg-ink/5 px-1.5 py-0.5">{f.domain_target}</code></p>
      </section>
      <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate>
        <h2 className="text-lg font-bold">{t('platform.settings.seller')}</h2>
        <p className="text-sm text-muted">{t('platform.settings.sellerHint')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {seller('legal_name', t('platform.settings.legalName'), { maxLength: 150 })}
          {seller('gstin', t('platform.settings.gstin'), { maxLength: 15, className: 'field-input uppercase' })}
          {seller('address', t('platform.settings.address'), { maxLength: 300 })}
          {seller('state_code', t('platform.settings.stateCode'), { maxLength: 2, inputMode: 'numeric' })}
          {seller('email', t('platform.settings.email'), { type: 'email' })}
          {seller('phone', t('platform.settings.phone'), { type: 'tel' })}
          <Field label={t('platform.settings.prefix')} error={errors['seller.invoice_prefix']}>{(a) => <input {...a} className="field-input uppercase" maxLength={6} value={f.seller.invoice_prefix} onChange={(e) => setF({ ...f, seller: { ...f.seller, invoice_prefix: e.target.value.toUpperCase() } })} />}</Field>
        </div>
        <h2 className="pt-2 text-lg font-bold">{t('platform.settings.billing')}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('platform.settings.grace')} hint={t('platform.settings.graceHint')} error={errors['billing.grace_days']}>{(a) => <input {...a} type="number" min={0} max={60} className="field-input" value={f.billing.grace_days} onChange={(e) => setF({ ...f, billing: { ...f.billing, grace_days: Number(e.target.value) } })} />}</Field>
          <Field label={t('platform.settings.gstRate')} hint={t('platform.settings.gstHint')}>{(a) => <select {...a} className="field-input" value={f.billing.gst_rate} onChange={(e) => setF({ ...f, billing: { ...f.billing, gst_rate: Number(e.target.value) } })}><option value={18}>18%</option><option value={0}>0%</option></select>}</Field>
          <Field label="SAC" hint={t('platform.settings.sacHint')} error={errors['billing.sac']}>{(a) => <input {...a} className="field-input" maxLength={6} inputMode="numeric" value={f.billing.sac} onChange={(e) => setF({ ...f, billing: { ...f.billing, sac: e.target.value } })} />}</Field>
        </div>
        <div className="flex justify-end"><button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button></div>
      </form>
    </div>
  );
}
