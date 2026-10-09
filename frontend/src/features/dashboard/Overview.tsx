import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router';
import { Check, Clock, ExternalLink, Lock, Palette } from 'lucide-react';
import { useCan, useSession } from '@/hooks/useSession';
import { daysUntil } from '@/lib/format';
import { tenantSiteUrl } from '@/lib/host';
import { Badge } from '@/components/ui';

const SETUP = ['account', 'type', 'details', 'theme', 'branding', 'menu', 'live'] as const;
// Where each finished step can be revisited.
const EDIT: Partial<Record<(typeof SETUP)[number], string>> = { details: '/dashboard/business', theme: '/dashboard/website', branding: '/dashboard/website', menu: '/dashboard/menu' };

export default function Overview() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const { data: session } = useSession();
  const canTheme = useCan('theme.manage');
  if (!session?.tenant) return null;
  const tenant = session.tenant;
  const trialDays = tenant.subscription?.status === 'trialing' ? daysUntil(tenant.subscription.trial_ends_at) : null;
  const siteUrl = tenantSiteUrl(tenant.slug);

  const enter = (i: number) => (reduce ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] as const } });

  return (
    <div className="space-y-6">
      <motion.div {...enter(0)}>
        <h1 className="text-3xl font-extrabold tracking-tight">{t('dashboard.welcome', { name: session.user.name.split(' ')[0] })}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-muted">
          {tenant.name} · {t(`types.${tenant.business_type}`)} · {tenant.city}
          <Badge tone={tenant.status}>{t(`statuses.${tenant.status}`)}</Badge>
          {session.role && <Badge tone="neutral">{t(`roles.${session.role}`)}</Badge>}
        </p>
      </motion.div>

      {trialDays !== null && (
        <motion.div {...enter(1)} className="flex items-center gap-3 rounded-card bg-ink px-5 py-4 text-paper">
          <Clock className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
          <p className="font-semibold">{t('dashboard.trialLeft', { count: trialDays, plan: tenant.plan.name })}</p>
        </motion.div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <motion.section {...enter(2)} className="card p-5 lg:col-span-2" aria-labelledby="setup-title">
          <h2 id="setup-title" className="text-lg font-bold">
            {t('dashboard.setupTitle')}
          </h2>
          <ol className="mt-4 space-y-2">
            {SETUP.map((key, i) => {
              const done = tenant.status !== 'onboarding' || i + 1 < tenant.onboarding_step;
              const edit = EDIT[key];
              return (
                <li key={key} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? 'bg-success text-white' : 'bg-paper text-muted'}`}>
                    {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
                  </span>
                  <span className={`flex-1 ${done ? 'text-muted line-through decoration-muted/40' : 'font-semibold'}`}>{t(`onboarding.steps.${key}`)}</span>
                  {done && edit ? (
                    <Link to={edit} className="text-xs font-semibold text-brand-strong underline underline-offset-2">
                      {t('common.edit')}
                      <span className="sr-only"> {t(`onboarding.steps.${key}`)}</span>
                    </Link>
                  ) : (
                    <span className="text-xs font-semibold text-muted">{done ? t('dashboard.setupDone') : t('dashboard.setupPending')}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </motion.section>

        <motion.section {...enter(3)} className="card p-5" aria-labelledby="site-title">
          <h2 id="site-title" className="text-lg font-bold">
            {t('dashboard.yourSite')}
          </h2>
          <p className="mt-2 break-all font-mono text-sm">{tenant.site_host}</p>
          {tenant.status === 'onboarding' ? (
            <p className="mt-2 text-sm text-muted">{t('dashboard.siteStatusOnboarding')}</p>
          ) : (
            tenant.status === 'live' && (
              <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-success">
                <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
                {t('dashboard.siteLive')}
              </p>
            )
          )}
          <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="btn-outline mt-4 w-full">
            {t('dashboard.openSite')} <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
          {canTheme && (
            <Link to="/dashboard/website" className="btn-ghost mt-2 w-full">
              <Palette className="h-4 w-4" aria-hidden="true" /> {t('dashboard.customiseSite')}
            </Link>
          )}
        </motion.section>
      </div>

      <motion.section {...enter(4)} className="card p-5" aria-labelledby="plan-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="plan-title" className="text-lg font-bold">
            {t('dashboard.planTitle')}: {tenant.plan.name}
          </h2>
          {tenant.subscription && <Badge tone={tenant.subscription.status}>{t(`statuses.${tenant.subscription.status}`)}</Badge>}
        </div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(session.features).map(([key, enabled]) => (
            <li key={key} className={`flex items-center gap-2 text-sm ${enabled ? '' : 'text-muted'}`}>
              {enabled ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
              {t(`features.${key}`)}
              {!enabled && <span className="sr-only">({t('dashboard.notIncluded')})</span>}
            </li>
          ))}
        </ul>
      </motion.section>
    </div>
  );
}
