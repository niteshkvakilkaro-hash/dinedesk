import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useFeature, useSession } from '@/hooks/useSession';
import { useAdminMenu } from '@/features/menu/api';
import { useWebsite } from '@/features/website/api';
import { useTables } from '@/features/tables/api';
import type { OpeningHours, StaffMember } from '@/types';
import type { Access } from './navigation';

/** Only the parts of these settings the checklist reads (same queries as their pages, so the cache is shared). */
interface OrderingPayload {
  settings: { accepting_orders: boolean; payments: { online: boolean; upi: boolean }; upi: { vpa: string | null } };
  razorpay: { has_key_secret: boolean };
}

export interface Step {
  key: 'menu' | 'hours' | 'logo' | 'ordering' | 'payments' | 'live' | 'team';
  to: string;
  done: boolean;
}

const hiddenKey = (tenantId: string) => `dd_get_started_hidden:${tenantId}`;

/**
 * "Get started" for owners: a short list of what's left to set up, worked out from the
 * business's own data (dishes, hours, logo, ordering, payments, website, team). Shown until
 * everything is done or the owner hides it (remembered on this device, per business).
 * A step whose data this person can't load is simply left out.
 */
export function GetStarted({ access }: { access: Access }) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const tenant = session?.tenant;
  const owner = access.business && !!tenant && tenant.status !== 'onboarding' && !session?.support;
  const [hidden, setHidden] = useState(() => {
    try {
      return !!tenant && localStorage.getItem(hiddenKey(tenant.id)) === '1';
    } catch {
      return false;
    }
  });
  const on = owner && !hidden;
  const hasWebsite = useFeature('website');

  const menu = useAdminMenu(on && access.menu);
  const business = useQuery({
    queryKey: ['business'],
    queryFn: async () => (await api.get<{ opening_hours: OpeningHours }>('/tenant/business')).data,
    enabled: on,
  });
  const website = useWebsite(on && access.website && hasWebsite);
  const ordering = useQuery({ queryKey: ['ordering'], queryFn: async () => (await api.get<OrderingPayload>('/tenant/ordering')).data, enabled: on });
  const tables = useTables(on && access.tablesSetup);
  const staff = useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const res = await api.get<StaffMember[]>('/tenant/staff');
      return { staff: res.data, meta: res.meta };
    },
    enabled: on && access.team,
  });

  if (!on || !tenant) return null;
  const sources = [menu, business, website, ordering, tables, staff];
  // Wait for everything before showing, so the count doesn't jump around.
  if (sources.some((s) => s.fetchStatus === 'fetching' && !s.data)) return null;

  const o = ordering.data?.settings;
  const steps: Step[] = [];
  if (menu.data) steps.push({ key: 'menu', to: '/dashboard/menu', done: menu.data.categories.some((c) => c.items.length > 0) });
  if (business.data) steps.push({ key: 'hours', to: '/dashboard/business?open=hours', done: Object.values(business.data.opening_hours ?? {}).some((d) => !d.closed && !!d.open) });
  if (website.data) steps.push({ key: 'logo', to: '/dashboard/website?tab=images', done: !!website.data.theme.logo });
  if (o) steps.push({ key: 'ordering', to: access.tablesSetup && !o.accepting_orders ? '/dashboard/tables?tab=setup' : '/dashboard/ordering', done: o.accepting_orders || (tables.data?.tables.length ?? 0) > 0 });
  if (o && ordering.data) steps.push({ key: 'payments', to: '/dashboard/ordering?open=payments', done: (o.payments.upi && !!o.upi.vpa) || (o.payments.online && ordering.data.razorpay.has_key_secret) });
  steps.push({ key: 'live', to: '/dashboard/website', done: tenant.status === 'live' });
  if (staff.data) steps.push({ key: 'team', to: '/dashboard/team', done: staff.data.staff.length > 1 });

  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  const hide = () => {
    try {
      localStorage.setItem(hiddenKey(tenant.id), '1');
    } catch {
      /* private mode: hidden for this visit only */
    }
    setHidden(true);
  };
  const pct = Math.round((done / steps.length) * 100);

  return (
    <section className="card p-5" aria-labelledby="get-started-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="get-started-title" className="text-lg font-bold">{t('dashboard.getStarted.title')}</h2>
          <p className="text-sm text-muted">{t('dashboard.getStarted.subtitle')}</p>
        </div>
        <button type="button" onClick={hide} className="-m-1 inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold text-muted hover:bg-ink/5 hover:text-ink" aria-label={t('dashboard.getStarted.dismissLabel')}>
          <X className="h-4 w-4" aria-hidden="true" /> {t('dashboard.getStarted.dismiss')}
        </button>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label={t('dashboard.getStarted.progress', { done, total: steps.length })}>
          <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="shrink-0 text-sm font-bold tabular-nums">{t('dashboard.getStarted.progress', { done, total: steps.length })}</p>
      </div>
      <ol className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.key}>
            {s.done ? (
              <div className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success text-white">
                  <Check className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 text-muted line-through decoration-muted/40">{t(`dashboard.getStarted.steps.${s.key}.title`)}</span>
                <span className="sr-only">{t('dashboard.getStarted.done')}</span>
              </div>
            ) : (
              <Link to={s.to} className="group flex min-h-14 items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2 hover:border-ink/30">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-sm font-bold text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t(`dashboard.getStarted.steps.${s.key}.title`)}</span>
                  <span className="block text-sm text-muted">{t(`dashboard.getStarted.steps.${s.key}.desc`)}</span>
                </span>
                <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-brand-strong sm:inline-flex">
                  {t('dashboard.getStarted.go')} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
                </span>
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
