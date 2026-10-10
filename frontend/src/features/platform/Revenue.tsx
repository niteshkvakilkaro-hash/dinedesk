import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { Alert, ErrorState, SkeletonRows } from '@/components/ui';

interface Revenue {
  mrr: number;
  arr: number;
  mrr_at_risk: number;
  businesses: number;
  paying: number;
  trialing: number;
  in_grace: number;
  read_only: number;
  trial_conversion: number | null;
  trials_ended_90d: number;
  churn_30d: number | null;
  by_plan: { code: string; name: string; paying: number; mrr: number; trialing: number }[];
  collected: { month: string; invoices: number; amount: number }[];
  signups: { month: string; count: number }[];
  unpriced_plans: string[];
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Super admin → Revenue: MRR, churn, trial conversion, money collected (real data only). */
export default function RevenuePage() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['platform', 'revenue'], queryFn: async () => (await api.get<Revenue>('/platform/revenue')).data });
  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.isError || !q.data) return <ErrorState message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  const r = q.data;
  const maxCollected = Math.max(1, ...r.collected.map((c) => c.amount));
  const pct = (v: number | null) => (v === null ? '—' : `${v}%`);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{t('platform.revenue.title')}</h1>
        <p className="text-muted">{t('platform.revenue.subtitle')}</p>
      </div>
      {!!r.unpriced_plans.length && <Alert tone="warn">{t('platform.revenue.unpriced', { plans: r.unpriced_plans.join(', ') })} <Link to="/platform/plans" className="font-bold underline">{t('platform.nav.plans')}</Link></Alert>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={t('platform.revenue.mrr')} value={formatMoney(r.mrr)} hint={t('platform.revenue.arr', { value: formatMoney(r.arr) })} />
        <Kpi label={t('platform.revenue.paying')} value={String(r.paying)} hint={t('platform.revenue.ofBusinesses', { count: r.businesses })} />
        <Kpi label={t('platform.revenue.conversion')} value={pct(r.trial_conversion)} hint={t('platform.revenue.conversionHint', { count: r.trials_ended_90d })} />
        <Kpi label={t('platform.revenue.churn')} value={pct(r.churn_30d)} hint={t('platform.revenue.churnHint')} />
        <Kpi label={t('platform.revenue.trialing')} value={String(r.trialing)} />
        <Kpi label={t('platform.revenue.grace')} value={String(r.in_grace)} />
        <Kpi label={t('platform.revenue.readOnly')} value={String(r.read_only)} />
        <Kpi label={t('platform.revenue.atRisk')} value={formatMoney(r.mrr_at_risk)} hint={t('platform.revenue.atRiskHint')} />
      </div>
      <section className="card space-y-3 p-5" aria-labelledby="rev-plan">
        <h2 id="rev-plan" className="text-lg font-bold">{t('platform.revenue.byPlan')}</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted"><th className="py-1.5 font-semibold">{t('platform.revenue.plan')}</th><th className="text-right font-semibold">{t('platform.revenue.paying')}</th><th className="text-right font-semibold">{t('platform.revenue.trialing')}</th><th className="text-right font-semibold">{t('platform.revenue.mrr')}</th></tr></thead>
          <tbody className="divide-y divide-line">{r.by_plan.map((p) => <tr key={p.code}><td className="py-1.5">{p.name}</td><td className="text-right tabular-nums">{p.paying}</td><td className="text-right tabular-nums">{p.trialing}</td><td className="text-right tabular-nums">{formatMoney(p.mrr)}</td></tr>)}</tbody>
        </table>
      </section>
      <section className="card space-y-3 p-5" aria-labelledby="rev-col">
        <h2 id="rev-col" className="text-lg font-bold">{t('platform.revenue.collected')}</h2>
        <ul className="space-y-1.5 text-sm">
          {r.collected.map((c) => (
            <li key={c.month} className="grid grid-cols-[5rem_1fr_7rem] items-center gap-2">
              <span className="text-muted">{c.month}</span>
              <span className="h-3 rounded-full bg-ink/5"><span className="block h-3 rounded-full bg-brand" style={{ width: `${(c.amount / maxCollected) * 100}%` }} /></span>
              <span className="text-right tabular-nums">{formatMoney(c.amount)}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">{t('platform.revenue.collectedHint')}</p>
      </section>
      <section className="card space-y-2 p-5" aria-labelledby="rev-sign">
        <h2 id="rev-sign" className="text-lg font-bold">{t('platform.revenue.signups')}</h2>
        <p className="flex flex-wrap gap-2 text-sm">{r.signups.map((s) => <span key={s.month} className="rounded-full bg-ink/5 px-3 py-1">{s.month}: <b>{s.count}</b></span>)}</p>
      </section>
    </div>
  );
}
