import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Check, ChevronDown, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/format';
import { tenantSiteUrl } from '@/lib/host';
import { SkeletonRows } from '@/components/ui';
import { THEMES } from '@/themes/registry';
import type { ThemeKey } from '@/themes/types';
import { DEMO_SLUG } from './content';

interface PublicPlan {
  code: string;
  name: string;
  description: string | null;
  price_monthly: string | null;
  features: string[];
  limits: Record<string, number | null>;
}

export function usePlans() {
  return useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const res = await api.get<PublicPlan[]>('/plans');
      return { plans: res.data, trial: (res.meta as { trial: { plan: string; days: number } }).trial };
    },
    staleTime: 10 * 60_000,
  });
}

export function useTrialNote() {
  const { t } = useTranslation();
  const plans = usePlans();
  const trial = plans.data?.trial;
  return trial ? t('landing.trialNote', { days: trial.days, plan: trial.plan.charAt(0).toUpperCase() + trial.plan.slice(1) }) : null;
}

/** Section heading used across the marketing pages. */
/** The dark stage at the top of the marketing pages (same light, grid and grain as the home hero). */
export function PageStage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className="px-2 pt-2 sm:px-4 sm:pt-4">
      <div className={`mk-stage relative overflow-hidden rounded-[1.75rem] text-white sm:rounded-[2.25rem] ${className}`}>
        <div className="mk-aurora -left-24 -top-32 h-[24rem] w-[24rem] bg-[#c2410c]" aria-hidden="true" />
        <div className="mk-aurora right-[-8rem] top-0 h-[20rem] w-[20rem] bg-[#f2b544] [animation-delay:-6s]" aria-hidden="true" />
        <div className="mk-grid" aria-hidden="true" />
        <div className="mk-grain" aria-hidden="true" />
        <div className="relative">{children}</div>
      </div>
    </section>
  );
}

export function Heading({ id, eyebrow, title, lead, center = false }: { id?: string; eyebrow?: string; title: string; lead?: string; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      {eyebrow && <p className="text-sm font-bold uppercase tracking-wider text-brand">{eyebrow}</p>}
      <h2 id={id} className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {lead && <p className="mt-3 text-lg text-muted">{lead}</p>}
    </div>
  );
}

export function Plans() {
  const { t } = useTranslation();
  const plans = usePlans();
  if (plans.isLoading) return <SkeletonRows rows={3} />;
  if (!plans.data) return null;
  const { trial } = plans.data;
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
      {plans.data.plans.map((p) => {
        const featured = p.code === trial.plan;
        return (
          <article key={p.code} className={`relative flex flex-col rounded-3xl border p-6 sm:p-7 ${featured ? 'border-ink bg-ink text-paper shadow-xl' : 'border-line bg-surface'}`}>
            <h3 className="text-xl font-extrabold">{p.name}</h3>
            <p className={`mt-1 text-sm ${featured ? 'text-paper/75' : 'text-muted'}`}>{p.description}</p>
            <p className="mt-5 text-3xl font-extrabold tabular-nums">
              {p.price_monthly === null ? (
                <span className={`text-base font-semibold ${featured ? 'text-paper/75' : 'text-muted'}`}>{t('landing.priceTbd')}</span>
              ) : (
                <>
                  {formatINR(p.price_monthly)}
                  <span className={`text-sm font-semibold ${featured ? 'text-paper/75' : 'text-muted'}`}>{t('landing.perMonth')}</span>
                </>
              )}
            </p>
            <Link to="/signup" className={`mt-5 ${featured ? 'btn-brand' : 'btn-outline'}`}>
              {t('mk.nav.start')}
            </Link>
            <ul className="mt-6 space-y-2.5 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className={`mt-0.5 h-4 w-4 shrink-0 ${featured ? 'text-gold' : 'text-success'}`} aria-hidden="true" />
                  {t(`features.${f}`)}
                </li>
              ))}
              {Object.entries(p.limits).map(([k, v]) => (
                <li key={k} className={`flex gap-2 ${featured ? 'text-paper/75' : 'text-muted'}`}>
                  <span className="w-4" />
                  {t(`limits.${k}`)}: {v === null ? t('limits.unlimited') : v}
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-line rounded-3xl border border-line bg-surface">
      {items.map((f) => (
        <details key={f.q} className="group px-5 sm:px-6">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 font-bold [&::-webkit-details-marker]:hidden">
            {f.q}
            <ChevronDown className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="pb-5 text-muted">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export function ThemeCard({ themeKey }: { themeKey: ThemeKey }) {
  const { t } = useTranslation();
  const theme = THEMES[themeKey];
  return (
    <article className="group overflow-hidden rounded-3xl border border-line bg-surface transition-shadow hover:shadow-xl">
      <div className="overflow-hidden border-b border-line">
        <img src={theme.preview} alt="" loading="lazy" width={960} height={720} className="aspect-[4/3] w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]" />
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-extrabold">{theme.name}</h3>
          <span className="flex gap-1" aria-hidden="true">
            {[theme.tokens.colors.primary, theme.tokens.colors.accent, theme.tokens.colors.bg].map((c) => (
              <span key={c} className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: c }} />
            ))}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-muted">{t(`website.themeHints.${themeKey}`)}</p>
        <a href={tenantSiteUrl(DEMO_SLUG[themeKey])} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-brand-strong hover:underline">
          {t('mk.themes.demo')}
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">({t('common.opensInNewTab')})</span>
        </a>
      </div>
    </article>
  );
}

/**
 * Themes shown on the NikoBite marketing pages, strongest first. Haveli Royal is left out here
 * (businesses using it keep it; it is still in the dashboard's theme picker).
 */
export const SHOWCASE_THEMES: ThemeKey[] = ['coastal', 'ember', 'rajwada', 'bistro', 'street', 'qsr', 'kulhad'];

export function ThemeGrid({ limit }: { limit?: number }) {
  const keys = limit ? SHOWCASE_THEMES.slice(0, limit) : SHOWCASE_THEMES;
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {keys.map((k) => (
        <ThemeCard key={k} themeKey={k} />
      ))}
    </div>
  );
}

const SHOWCASE_MS = 4800;

/**
 * Home page: pick a theme on the left and the big browser frame switches to it. Moves on by itself
 * every few seconds until the visitor points at it or picks one (never with reduced motion).
 */
export function ThemeShowcase() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const [picked, setPicked] = useState(false);
  const running = !reduce && !held && !picked;

  useEffect(() => {
    if (!running) return undefined;
    const id = setTimeout(() => setActive((a) => (a + 1) % SHOWCASE_THEMES.length), SHOWCASE_MS);
    return () => clearTimeout(id);
  }, [running, active]);

  const key = SHOWCASE_THEMES[active];
  const theme = THEMES[key];
  const url = tenantSiteUrl(DEMO_SLUG[key]);

  return (
    <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.6fr)] lg:gap-12" onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}>
      <div role="tablist" aria-label={t('mk.themes.title')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
        {SHOWCASE_THEMES.map((k, i) => {
          const on = i === active;
          const c = THEMES[k].tokens.colors;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              id={`theme-tab-${k}`}
              aria-selected={on}
              aria-controls="theme-panel"
              onClick={() => {
                setActive(i);
                setPicked(true);
              }}
              className={`relative flex shrink-0 items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3 text-start transition-all duration-300 lg:w-full ${on ? 'border-ink/15 bg-surface shadow-lg shadow-ink/5' : 'border-transparent hover:bg-surface/70'}`}
            >
              <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
                {[c.primary, c.accent, c.bg].map((col) => (
                  <span key={col} className="h-5 w-5 rounded-full ring-2 ring-surface" style={{ background: col }} />
                ))}
              </span>
              <span className="min-w-0">
                <span className={`block whitespace-nowrap font-extrabold ${on ? 'text-ink' : 'text-muted'}`}>{THEMES[k].name}</span>
                <span className={on ? 'hidden text-sm text-muted lg:block' : 'hidden'}>{t(`website.themeHints.${k}`)}</span>
              </span>
              {on && running && <span key={active} className="mk-progress absolute inset-x-0 bottom-0 h-0.5 origin-left bg-brand" style={{ animationDuration: `${SHOWCASE_MS}ms` }} aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div id="theme-panel" role="tabpanel" aria-labelledby={`theme-tab-${key}`} className="relative">
        {/* A soft glow in the theme's own colour behind the frame. */}
        <div className="pointer-events-none absolute -inset-6 rounded-[3rem] opacity-60 blur-3xl transition-colors duration-700" style={{ background: `radial-gradient(60% 60% at 50% 50%, ${theme.tokens.colors.primary}55, transparent 70%)` }} aria-hidden="true" />
        <div className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-ink/15">
          <div className="flex h-9 items-center gap-2 border-b border-line bg-paper px-3" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-3 hidden max-w-xs flex-1 truncate rounded-md bg-surface px-3 py-0.5 text-center text-[11px] text-muted sm:block">{url.replace(/^https?:\/\//, '')}</span>
          </div>
          <div className="relative aspect-[4/3] bg-paper">
            <AnimatePresence initial={false}>
              <motion.img
                key={key}
                src={theme.preview}
                alt={t('mk.themes.previewAlt', { name: theme.name })}
                width={960}
                height={720}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover object-top"
                initial={reduce ? false : { opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </AnimatePresence>
          </div>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn-brand mk-glow absolute -bottom-5 right-5 !min-h-11 !px-5 text-sm shadow-xl">
          {t('mk.themes.demo')}: {theme.name}
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">({t('common.opensInNewTab')})</span>
        </a>
      </div>
    </div>
  );
}

export function CtaBand() {
  const { t } = useTranslation();
  const trial = useTrialNote();
  return (
    <section className="px-4 pb-20 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-ink px-6 py-14 text-center text-paper sm:px-12 sm:py-20">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/30 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-gold/20 blur-3xl" aria-hidden="true" />
        <h2 className="relative mx-auto max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">{t('mk.cta.title')}</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-lg text-paper/75">{t('mk.cta.text')}</p>
        <Link to="/signup" className="btn-brand relative mt-8 !px-8 text-base">
          {t('mk.cta.button')}
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
        {trial && <p className="relative mt-4 text-sm text-paper/60">{trial}</p>}
      </div>
    </section>
  );
}
