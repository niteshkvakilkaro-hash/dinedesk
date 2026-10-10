import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { api, type Paginated } from '@/lib/api';
import { formatDate, formatDateTime, formatINR, formatPhone } from '@/lib/format';
import { useDebounced } from '@/hooks/useDebounced';
import { Badge, DemoBadge, EmptyState, ErrorState, SkeletonRows } from '@/components/ui';
import type { PlatformTenantRow } from '@/types';

interface Summary {
  total: number;
  by_status: Record<string, number>;
  trialing: number;
  mrr: number;
}

export default function Tenants() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [plan, setPlan] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim(), 300);

  const query = useQuery({
    queryKey: ['platform', 'tenants', { q, status, plan, type, sort, page }],
    queryFn: async () => {
      const res = await api.get<PlatformTenantRow[]>('/platform/tenants', { search: q, status, plan, type, sort, page });
      return { rows: res.data, meta: res.meta as unknown as Paginated & { summary: Summary } };
    },
    placeholderData: keepPreviousData,
  });
  const summary = query.data?.meta.summary;
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  const cards = summary
    ? [
        { label: t('platform.tenants.total'), value: summary.total },
        { label: t('platform.tenants.live'), value: summary.by_status.live ?? 0 },
        { label: t('platform.tenants.trialing'), value: summary.trialing },
        { label: t('platform.tenants.platformMrr'), value: formatINR(summary.mrr), note: t('platform.tenants.mrrNote') },
      ]
    : [];

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight">{t('platform.tenants.title')}</h1>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summary
          ? cards.map((c) => (
              <div key={c.label} className="card p-4">
                <p className="text-sm font-semibold text-muted">{c.label}</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums">{c.value}</p>
                {c.note && <p className="text-xs text-muted">{c.note}</p>}
              </div>
            ))
          : Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-24" />)}
      </div>

      <div className="card mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">{t('platform.tenants.search')}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input className="field-input !py-2 !pl-9 text-sm" placeholder={t('platform.tenants.search')} value={search} onChange={(e) => reset(setSearch)(e.target.value)} />
          </label>
          {[
            [status, reset(setStatus), t('platform.tenants.allStatuses'), ['onboarding', 'live', 'suspended', 'read_only'], 'statuses', t('platform.tenants.status')],
            [plan, reset(setPlan), t('platform.tenants.allPlans'), ['starter', 'growth', 'pro'], null, t('platform.tenants.plan')],
            [type, reset(setType), t('platform.tenants.allTypes'), ['restaurant', 'cafe', 'cloud_kitchen', 'hotel'], 'types', t('onboarding.steps.type')],
          ].map(([value, onChange, all, options, ns, label]) => (
            <label key={label as string}>
              <span className="sr-only">{label as string}</span>
              <select className="field-input !w-auto !py-2 text-sm" value={value as string} onChange={(e) => (onChange as (v: string) => void)(e.target.value)}>
                <option value="">{all as string}</option>
                {(options as string[]).map((o) => (
                  <option key={o} value={o}>
                    {ns ? t(`${ns}.${o}`) : o.charAt(0).toUpperCase() + o.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            <span className="sr-only">{t('platform.tenants.sort')}</span>
            <select className="field-input !w-auto !py-2 text-sm" value={sort} onChange={(e) => reset(setSort)(e.target.value)}>
              <option value="newest">{t('platform.tenants.sortNewest')}</option>
              <option value="oldest">{t('platform.tenants.sortOldest')}</option>
              <option value="name">{t('platform.tenants.sortName')}</option>
              <option value="last_active">{t('platform.tenants.sortActive')}</option>
            </select>
          </label>
        </div>

        {query.isLoading ? (
          <SkeletonRows rows={6} />
        ) : query.isError ? (
          <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />
        ) : !query.data!.rows.length ? (
          <EmptyState title={t('common.noResults')}>{t('platform.tenants.empty')}</EmptyState>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${query.isFetching ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-paper text-left text-muted">
                <tr>
                  {['business', 'plan', 'status', 'owner', 'mrr', 'lastActive', 'created'].map((c) => (
                    <th key={c} scope="col" className={`px-4 py-2.5 font-semibold ${c === 'mrr' ? 'text-right' : ''}`}>
                      {t(`platform.tenants.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {query.data!.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-paper/60">
                    <td className="px-4 py-3">
                      <Link to={`/platform/tenants/${r.id}`} className="font-semibold hover:underline">
                        {r.name}
                      </Link>{' '}
                      {r.is_demo && <DemoBadge />}
                      <span className="block font-mono text-xs text-muted">{r.site_host}</span>
                      <span className="block text-xs text-muted">
                        {t(`types.${r.business_type}`)} · {r.city}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold">{r.plan.name}</span>
                      {r.subscription_status && (
                        <span className="block text-xs text-muted">
                          {t(`statuses.${r.subscription_status}`)}
                          {r.subscription_status === 'trialing' && r.trial_ends_at ? ` · ${formatDate(r.trial_ends_at)}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={r.status}>{t(`statuses.${r.status}`)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {r.owner_name}
                      <span className="block text-xs text-muted">{r.owner_contact?.startsWith('+91') ? formatPhone(r.owner_contact) : r.owner_contact}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatINR(r.mrr)}</td>
                    <td className="px-4 py-3 text-muted">{formatDateTime(r.last_active_at)}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {query.data && query.data.meta.last_page > 1 && (
          <nav className="flex items-center justify-between border-t border-line px-4 py-3 text-sm" aria-label="Pagination">
            <span className="text-muted">{t('common.pageOf', { page: query.data.meta.current_page, total: query.data.meta.last_page })}</span>
            <div className="flex gap-2">
              <button type="button" className="btn-outline !min-h-9 !px-3" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={t('common.previous')}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className="btn-outline !min-h-9 !px-3" disabled={page >= query.data.meta.last_page} onClick={() => setPage(page + 1)} aria-label={t('common.next')}>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
