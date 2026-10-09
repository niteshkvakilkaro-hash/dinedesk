import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'motion/react';
import { api, ApiError } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { LanguageToggle, LogoMark } from '@/components/Brand';
import { DemoBadge, Spinner } from '@/components/ui';
import { DAYS } from '@/components/HoursEditor';
import type { BusinessType, OpeningHours } from '@/types';

interface SiteInfo {
  name: string;
  business_type: BusinessType;
  city: string | null;
  status: string;
  is_live: boolean;
  is_demo: boolean;
  timezone: string;
  opening_hours: OpeningHours | null;
  open_status: { is_open: boolean; closes_at: string | null; opens_at: string | null; today: string } | null;
}

/**
 * Phase 1 public site for a business subdomain: name, live open/closed badge
 * and hours. Phase 2 replaces this with the chosen theme (Haveli / Bistro / Street).
 */
export default function TenantSite() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const query = useQuery({
    queryKey: ['site'],
    queryFn: async () => (await api.get<SiteInfo>('/site')).data,
    retry: (count, e) => !(e instanceof ApiError && e.status === 404) && count < 1,
    refetchInterval: 60_000, // keeps the open/closed badge current
  });
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (query.data) document.title = query.data.name;
  }, [query.data]);

  if (query.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <LogoMark className="h-12 w-12" />
        <h1 className="mt-5 text-3xl font-extrabold">{t('site.notFoundTitle')}</h1>
        <p className="mt-2 text-muted">{query.error instanceof ApiError && query.error.status !== 404 ? query.error.message : t('site.notFoundText')}</p>
      </main>
    );
  }

  const site = query.data;
  const status = site.open_status;
  const fade = (i: number) => (reduce ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] as const } });

  return (
    <div className="flex min-h-screen flex-col bg-ink text-paper">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <span className="flex items-center gap-2 font-bold">
          {site.name} {site.is_demo && <DemoBadge />}
        </span>
        <LanguageToggle light />
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-12 sm:px-8">
        {site.is_demo && (
          <motion.p {...fade(0)} className="mb-4 text-sm text-paper/70">
            {t('site.demoNotice')}
          </motion.p>
        )}
        <motion.p {...fade(0)} className="text-sm font-bold uppercase tracking-wider text-gold">
          {t(`types.${site.business_type}`)} · {site.city}
        </motion.p>
        <motion.h1 {...fade(1)} className="mt-3 text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          {site.name}
        </motion.h1>
        {status && (
          <motion.p {...fade(2)} className="mt-5">
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${status.is_open ? 'bg-success/20 text-[#bbf7d0]' : 'bg-paper/10 text-paper'}`}>
              <span className={`h-2 w-2 rounded-full ${status.is_open ? 'bg-[#4ade80]' : 'bg-paper/60'}`} aria-hidden="true" />
              {status.is_open ? t('site.openNow') : t('site.closedNow')}
              {status.is_open && status.closes_at && ` · ${t('site.until', { time: formatTime(status.closes_at) })}`}
              {!status.is_open && status.opens_at && ` · ${t('site.opensAt', { time: formatTime(status.opens_at) })}`}
            </span>
          </motion.p>
        )}
        {!site.is_live && (
          <motion.div {...fade(3)} className="mt-10 rounded-card border border-paper/15 p-6">
            <h2 className="text-xl font-bold">{t('site.comingSoonTitle')}</h2>
            <p className="mt-2 text-paper/75">{t('site.comingSoonText', { name: site.name })}</p>
          </motion.div>
        )}
        {site.opening_hours && (
          <motion.section {...fade(4)} className="mt-10" aria-labelledby="hours-title">
            <h2 id="hours-title" className="text-sm font-bold uppercase tracking-wider text-gold">
              {t('site.hours')}
            </h2>
            <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-[15px] sm:grid-cols-2">
              {DAYS.map((d) => {
                const h = site.opening_hours![d];
                const today = status?.today === d;
                return (
                  <div key={d} className={`flex justify-between gap-4 ${today ? 'font-bold text-gold' : 'text-paper/80'}`}>
                    <dt>{t(`days.${d}`)}</dt>
                    <dd className="tabular-nums">{h.closed ? t('onboarding.closed') : `${formatTime(h.open)} – ${formatTime(h.close)}`}</dd>
                  </div>
                );
              })}
            </dl>
          </motion.section>
        )}
      </main>
      <footer className="px-5 py-6 text-center text-xs text-paper/60">{t('site.poweredBy')}</footer>
    </div>
  );
}
