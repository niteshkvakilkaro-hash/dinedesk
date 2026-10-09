import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/format';
import { LanguageToggle, Logo } from '@/components/Brand';
import { SkeletonRows } from '@/components/ui';

interface PublicPlan {
  code: string;
  name: string;
  description: string | null;
  price_monthly: string | null;
  features: string[];
  limits: Record<string, number | null>;
}

export default function Landing() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const res = await api.get<PublicPlan[]>('/plans');
      return { plans: res.data, trial: (res.meta as { trial: { plan: string; days: number } }).trial };
    },
  });
  const rise = (i: number) => (reduce ? {} : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay: 0.08 * i, ease: [0.22, 1, 0.36, 1] as const } });

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <Link to="/login" className="btn-ghost hidden sm:inline-flex">
            {t('common.signIn')}
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-20">
          <motion.p {...rise(0)} className="text-sm font-bold uppercase tracking-wider text-brand">
            {t('landing.eyebrow')}
          </motion.p>
          <motion.h1 {...rise(1)} className="mt-3 max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            {t('landing.title')}
          </motion.h1>
          <motion.p {...rise(2)} className="mt-5 max-w-2xl text-lg text-muted">
            {t('landing.subtitle')}
          </motion.p>
          <motion.div {...rise(3)} className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/signup" className="btn-brand !px-7 text-base">
              {t('landing.cta')}
            </Link>
            <Link to="/login" className="btn-outline !px-7 text-base sm:hidden">
              {t('common.signIn')}
            </Link>
            {plans.data && <span className="text-sm text-muted">{t('landing.trialNote', { days: plans.data.trial.days, plan: plans.data.trial.plan.charAt(0).toUpperCase() + plans.data.trial.plan.slice(1) })}</span>}
          </motion.div>
        </section>

        <section className="border-t border-line bg-surface py-16" aria-labelledby="plans-title">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <h2 id="plans-title" className="text-3xl font-extrabold tracking-tight">
              {t('landing.plansTitle')}
            </h2>
            {plans.isLoading ? (
              <SkeletonRows rows={3} />
            ) : (
              <div className="mt-8 grid gap-5 md:grid-cols-3">
                {plans.data?.plans.map((p) => (
                  <article key={p.code} className={`card flex flex-col p-6 ${p.code === plans.data.trial.plan ? 'ring-2 ring-ink' : ''}`}>
                    <h3 className="text-xl font-extrabold">{p.name}</h3>
                    <p className="mt-1 text-sm text-muted">{p.description}</p>
                    <p className="mt-4 text-2xl font-extrabold tabular-nums">
                      {p.price_monthly === null ? (
                        <span className="text-base font-semibold text-muted">{t('landing.priceTbd')}</span>
                      ) : (
                        <>
                          {formatINR(p.price_monthly)}
                          <span className="text-sm font-semibold text-muted">{t('landing.perMonth')}</span>
                        </>
                      )}
                    </p>
                    <ul className="mt-5 space-y-2 text-sm">
                      {p.features.map((f) => (
                        <li key={f} className="flex gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                          {t(`features.${f}`)}
                        </li>
                      ))}
                      {Object.entries(p.limits).map(([k, v]) => (
                        <li key={k} className="flex gap-2 text-muted">
                          <span className="w-4" />
                          {t(`limits.${k}`)}: {v === null ? t('limits.unlimited') : v}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
