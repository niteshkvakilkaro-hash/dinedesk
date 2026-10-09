import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/lib/api';
import { Alert, ErrorState, Field, SkeletonRows, Spinner, toast } from '@/components/ui';
import type { Plan } from '@/types';

interface Meta {
  catalogue: Record<string, string>;
  limit_keys: string[];
}

function PlanCard({ plan, meta }: { plan: Plan; meta: Meta }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    price_monthly: plan.price_monthly ?? '',
    price_yearly: plan.price_yearly ?? '',
    features: plan.features,
    limits: Object.fromEntries(meta.limit_keys.map((k) => [k, plan.limits[k] === null || plan.limits[k] === undefined ? '' : String(plan.limits[k])])),
    is_active: plan.is_active,
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.put<Plan>(`/platform/plans/${plan.code}`, {
        price_monthly: form.price_monthly === '' ? null : Number(form.price_monthly),
        price_yearly: form.price_yearly === '' ? null : Number(form.price_yearly),
        features: form.features,
        limits: Object.fromEntries(Object.entries(form.limits).map(([k, v]) => [k, v === '' ? null : Number(v)])),
        is_active: form.is_active,
      }),
    onSuccess: () => {
      toast.success(t('platform.plans.saved'));
      void qc.invalidateQueries({ queryKey: ['platform'] });
    },
    onError: (e: ApiError) => setError(e.message),
  });

  const toggle = (f: string) => setForm({ ...form, features: form.features.includes(f) ? form.features.filter((x) => x !== f) : [...form.features, f] });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        mutation.mutate();
      }}
      className="card flex flex-col p-5"
      aria-labelledby={`plan-${plan.code}`}
    >
      <h2 id={`plan-${plan.code}`} className="text-xl font-extrabold">
        {plan.name}
      </h2>
      <p className="text-sm text-muted">{plan.description}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label={t('platform.plans.monthly')} hint={form.price_monthly === '' ? t('platform.plans.priceEmpty') : undefined}>
          {(a) => <input {...a} type="number" min="0" step="1" className="field-input" value={form.price_monthly} onChange={(e) => setForm({ ...form, price_monthly: e.target.value })} />}
        </Field>
        <Field label={t('platform.plans.yearly')} hint={form.price_yearly === '' ? t('platform.plans.priceEmpty') : undefined}>
          {(a) => <input {...a} type="number" min="0" step="1" className="field-input" value={form.price_yearly} onChange={(e) => setForm({ ...form, price_yearly: e.target.value })} />}
        </Field>
      </div>
      <fieldset className="mt-4">
        <legend className="field-label">{t('platform.detail.features')}</legend>
        <ul className="grid gap-1.5">
          {Object.keys(meta.catalogue).map((f) => (
            <li key={f}>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[var(--dd-ink)]" checked={form.features.includes(f)} onChange={() => toggle(f)} />
                {t(`features.${f}`)}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <fieldset className="mt-4 grid grid-cols-3 gap-2">
        <legend className="field-label">{t('limits.staff_accounts')} / …</legend>
        {meta.limit_keys.map((k) => (
          <Field key={k} label={t(`limits.${k}`)}>
            {(a) => <input {...a} type="number" min="0" placeholder="∞" title={t('platform.plans.unlimitedHint')} className="field-input" value={form.limits[k]} onChange={(e) => setForm({ ...form, limits: { ...form.limits, [k]: e.target.value } })} />}
          </Field>
        ))}
      </fieldset>
      <p className="mt-1 text-xs text-muted">{t('platform.plans.unlimitedHint')}</p>
      <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" className="h-4 w-4 accent-[var(--dd-ink)]" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
        {t('platform.plans.active')}
      </label>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <button type="submit" className="btn-primary mt-5" disabled={mutation.isPending}>
        {mutation.isPending ? <Spinner /> : t('common.save')}
      </button>
    </form>
  );
}

export default function Plans() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['platform', 'plans'],
    queryFn: async () => {
      const res = await api.get<Plan[]>('/platform/plans');
      return { plans: res.data, meta: res.meta as unknown as Meta };
    },
  });

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight">{t('platform.plans.title')}</h1>
      <p className="mt-1 text-muted">{t('platform.plans.subtitle')}</p>
      <div className="mt-6">
        {query.isLoading ? (
          <SkeletonRows rows={6} />
        ) : query.isError ? (
          <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            {query.data!.plans.map((p) => (
              <PlanCard key={p.id} plan={p} meta={query.data!.meta} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
