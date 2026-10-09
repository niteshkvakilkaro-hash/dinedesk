import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatDateTime, formatINR, formatPhone } from '@/lib/format';
import { tenantSiteUrl } from '@/lib/host';
import { Alert, Badge, DemoBadge, ErrorState, Field, SkeletonRows, Spinner, toast } from '@/components/ui';
import type { PlatformTenantDetail, TenantStatus } from '@/types';

function ChangeForm({ tenant }: { tenant: PlatformTenantDetail }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [plan, setPlan] = useState(tenant.plan.code);
  const [status, setStatus] = useState<TenantStatus>(tenant.status);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const changed = plan !== tenant.plan.code || status !== tenant.status;

  const mutation = useMutation({
    mutationFn: () => api.patch<PlatformTenantDetail>(`/platform/tenants/${tenant.id}`, { ...(plan !== tenant.plan.code && { plan }), ...(status !== tenant.status && { status }), reason }),
    onSuccess: (res) => {
      qc.setQueryData(['platform', 'tenant', tenant.id], res.data);
      void qc.invalidateQueries({ queryKey: ['platform', 'tenants'] });
      setReason('');
      toast.success(t('common.saved'));
    },
    onError: (e: ApiError) => setError(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        if (reason.trim().length < 5) {
          setError(t('platform.detail.reason'));
          return;
        }
        mutation.mutate();
      }}
      className="space-y-4"
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('platform.detail.changePlan')}>
          {(a) => (
            <select {...a} className="field-input" value={plan} onChange={(e) => setPlan(e.target.value)}>
              {['starter', 'growth', 'pro'].map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('platform.detail.changeStatus')}>
          {(a) => (
            <select {...a} className="field-input" value={status} onChange={(e) => setStatus(e.target.value as TenantStatus)}>
              {(['onboarding', 'live', 'suspended', 'read_only'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`statuses.${s}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {changed && (
        <Field label={t('platform.detail.reason')}>
          {(a) => <input {...a} className="field-input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} />}
        </Field>
      )}
      {error && <Alert>{error}</Alert>}
      <button type="submit" className="btn-primary" disabled={!changed || mutation.isPending}>
        {mutation.isPending ? <Spinner /> : t('platform.detail.apply')}
      </button>
    </form>
  );
}

function FeatureRow({ tenant, feature }: { tenant: PlatformTenantDetail; feature: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const override = tenant.overrides.find((o) => o.feature === feature);
  const [choice, setChoice] = useState<'default' | 'on' | 'off'>(override ? (override.enabled ? 'on' : 'off') : 'default');
  const [reason, setReason] = useState('');
  const dirty = choice !== (override ? (override.enabled ? 'on' : 'off') : 'default');

  const mutation = useMutation({
    mutationFn: () =>
      choice === 'default'
        ? api.delete<PlatformTenantDetail>(`/platform/tenants/${tenant.id}/feature-overrides/${feature}`)
        : api.post<PlatformTenantDetail>(`/platform/tenants/${tenant.id}/feature-overrides`, { feature, enabled: choice === 'on', reason }),
    onSuccess: (res) => {
      qc.setQueryData(['platform', 'tenant', tenant.id], res.data);
      setReason('');
      toast.success(t('common.saved'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <span className="min-w-[160px] flex-1">
        <span className="font-semibold">{t(`features.${feature}`)}</span>{' '}
        <Badge tone={tenant.features[feature] ? 'live' : 'neutral'}>{tenant.features[feature] ? 'ON' : 'OFF'}</Badge>
        {override && <span className="block text-xs text-muted">{override.reason}{override.expires_at ? ` · ${formatDate(override.expires_at)}` : ''}</span>}
      </span>
      <label className="sr-only" htmlFor={`ov-${feature}`}>
        {t('platform.detail.override')}
      </label>
      <select id={`ov-${feature}`} className="field-input !w-auto !py-1.5 text-sm" value={choice} onChange={(e) => setChoice(e.target.value as typeof choice)}>
        <option value="default">{t('platform.detail.planDefault')}</option>
        <option value="on">{t('platform.detail.forceOn')}</option>
        <option value="off">{t('platform.detail.forceOff')}</option>
      </select>
      {dirty && choice !== 'default' && (
        <input className="field-input !w-56 !py-1.5 text-sm" placeholder={t('platform.detail.overrideReason')} aria-label={t('platform.detail.overrideReason')} value={reason} onChange={(e) => setReason(e.target.value)} />
      )}
      {dirty && (
        <button type="button" className="btn-primary !min-h-9 !px-4 text-sm" disabled={mutation.isPending || (choice !== 'default' && reason.trim().length < 5)} onClick={() => mutation.mutate()}>
          {mutation.isPending ? <Spinner className="h-4 w-4" /> : t('common.save')}
        </button>
      )}
    </li>
  );
}

export default function TenantDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ['platform', 'tenant', id], queryFn: async () => (await api.get<PlatformTenantDetail>(`/platform/tenants/${id}`)).data });

  if (query.isLoading) return <SkeletonRows rows={8} />;
  if (query.isError || !query.data) return <ErrorState message={(query.error as Error)?.message} onRetry={() => void query.refetch()} />;
  const tenant = query.data;

  return (
    <div className="space-y-6">
      <Link to="/platform" className="btn-ghost !min-h-9 !px-3 text-sm">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('platform.tenants.title')}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-3xl font-extrabold tracking-tight">
            {tenant.name} {tenant.is_demo && <DemoBadge />}
          </h1>
          <p className="mt-1 text-muted">
            {t(`types.${tenant.business_type}`)} · {tenant.city} · {tenant.gstin ?? 'GSTIN —'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={tenant.status}>{t(`statuses.${tenant.status}`)}</Badge>
          <a className="btn-outline !min-h-10" href={tenantSiteUrl(tenant.slug)} target="_blank" rel="noopener noreferrer">
            {tenant.site_host} <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card space-y-4 p-5 lg:col-span-2" aria-labelledby="change-title">
          <h2 id="change-title" className="text-lg font-bold">
            {t('platform.detail.changePlan')} / {t('platform.detail.changeStatus')}
          </h2>
          <ChangeForm key={`${tenant.plan.code}-${tenant.status}`} tenant={tenant} />
        </section>
        <section className="card space-y-3 p-5 text-sm" aria-labelledby="overview-title">
          <h2 id="overview-title" className="text-lg font-bold">
            {t('platform.detail.overview')}
          </h2>
          <p>
            <span className="text-muted">{t('platform.tenants.owner')}:</span> {tenant.owner?.name} · {tenant.owner?.email ?? formatPhone(tenant.owner?.phone)}
          </p>
          <p>
            <span className="text-muted">{t('platform.tenants.mrr')}:</span> {formatINR(tenant.mrr)}
          </p>
          <p>
            <span className="text-muted">{t('platform.detail.subscription')}:</span> {tenant.subscription_status ? t(`statuses.${tenant.subscription_status}`) : '—'}
            {tenant.trial_ends_at && ` · ${t('platform.detail.trialEnds')} ${formatDate(tenant.trial_ends_at)}`}
          </p>
          <div>
            <p className="text-muted">{t('platform.detail.domains')}:</p>
            <ul className="font-mono text-xs">
              {tenant.domains.map((d) => (
                <li key={d.domain}>
                  {d.domain} {d.is_primary && '(primary)'}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <section className="card p-5" aria-labelledby="features-title">
        <h2 id="features-title" className="text-lg font-bold">
          {t('platform.detail.features')}
        </h2>
        <ul className="mt-2 divide-y divide-line">
          {Object.keys(tenant.features).map((f) => (
            <FeatureRow key={`${f}-${tenant.overrides.find((o) => o.feature === f)?.enabled ?? 'd'}`} tenant={tenant} feature={f} />
          ))}
        </ul>
      </section>

      <section className="card p-5" aria-labelledby="activity-title">
        <h2 id="activity-title" className="text-lg font-bold">
          {t('platform.detail.activity')}
        </h2>
        {tenant.recent_activity.length ? (
          <ol className="mt-3 space-y-2 text-sm">
            {tenant.recent_activity.map((a, i) => (
              <li key={i} className="flex flex-wrap gap-x-3">
                <span className="font-mono text-xs text-muted">{formatDateTime(a.at)}</span>
                <span className="font-semibold">{a.action}</span>
                {a.by && <span className="text-muted">by {a.by}</span>}
                {typeof a.meta?.reason === 'string' && <span className="text-muted">— {a.meta.reason}</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-muted">{t('platform.detail.noActivity')}</p>
        )}
      </section>
    </div>
  );
}
