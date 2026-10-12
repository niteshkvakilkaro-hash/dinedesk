import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, BellRing, Check, CheckCircle2, Palette, QrCode, ReceiptText, Store, Users } from 'lucide-react';
import { PLATFORM_DOMAIN } from '@/lib/host';
import { featurePath, MODULES } from './content';
import { CtaBand, Faq, Heading, Plans, ThemeGrid, useTrialNote } from './parts';
import { faqJsonLd, orgJsonLd, usePageMeta } from './seo';
import siteDesktop from './assets/site-desktop.webp';
import sitePhone from './assets/site-phone.webp';
import dashboardPos from './assets/dashboard-pos.webp';

/** A screenshot in a simple browser window frame. */
export function BrowserFrame({ src, alt, url, className = '', eager = false }: { src: string; alt: string; url: string; className?: string; eager?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-ink/15 ${className}`}>
      <div className="flex h-9 items-center gap-2 border-b border-line bg-paper px-3" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 hidden max-w-xs flex-1 truncate rounded-md bg-surface px-3 py-0.5 text-center text-[11px] text-muted sm:block">{url}</span>
      </div>
      <img src={src} alt={alt} width={1440} height={900} loading={eager ? 'eager' : 'lazy'} {...(eager ? { fetchpriority: 'high' } : {})} className="block w-full" />
    </div>
  );
}

export default function Landing() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const trial = useTrialNote();
  const faq = t('mk.faq.items', { returnObjects: true }) as { q: string; a: string }[];
  const steps = t('mk.how.steps', { returnObjects: true }) as { title: string; text: string }[];
  const india = t('mk.india.items', { returnObjects: true }) as string[];
  const points = t('mk.hero.points', { returnObjects: true }) as string[];
  usePageMeta({ title: t('mk.seo.homeTitle'), description: t('mk.seo.homeDesc'), path: '/', jsonLd: [...orgJsonLd(), faqJsonLd(faq)] });
  const rise = (i: number) => (reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay: 0.07 * i, ease: [0.22, 1, 0.36, 1] as const } });

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(60%_60%_at_70%_10%,var(--dd-brand-soft),transparent_70%)]" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:pb-24">
          <div>
            <motion.p {...rise(0)} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-muted sm:text-sm">
              <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
              {t('mk.hero.eyebrow')}
            </motion.p>
            <motion.h1 {...rise(1)} className="mt-5 text-[2.6rem] font-extrabold leading-[1.04] tracking-tight sm:text-6xl">
              {t('mk.hero.title')}
            </motion.h1>
            <motion.p {...rise(2)} className="mt-5 max-w-xl text-lg text-muted">
              {t('mk.hero.lead')}
            </motion.p>
            <motion.div {...rise(3)} className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/signup" className="btn-brand !px-7 text-base">
                {t('mk.hero.primary')}
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
              <Link to="/themes" className="btn-outline !px-7 text-base">
                {t('mk.hero.secondary')}
              </Link>
            </motion.div>
            {trial && (
              <motion.p {...rise(4)} className="mt-3 text-sm text-muted">
                {trial}
              </motion.p>
            )}
            <motion.ul {...rise(5)} className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
              {points.map((p) => (
                <li key={p} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                  {p}
                </li>
              ))}
            </motion.ul>
          </div>

          <motion.div {...rise(2)} className="relative mx-auto w-full max-w-xl pb-16 pr-6 lg:max-w-none lg:pr-10" role="img" aria-label={t('mk.hero.visualAlt')}>
            <BrowserFrame src={siteDesktop} alt="" url={`hotel-demo.${PLATFORM_DOMAIN}`} eager />
            {/* The phone sits over the browser's bottom-right corner. */}
            <div className="absolute bottom-0 right-0 w-[23%] max-w-[150px] overflow-hidden rounded-[1.4rem] border-[5px] border-ink bg-ink shadow-2xl">
              <img src={sitePhone} alt="" width={390} height={844} className="block w-full" />
            </div>
            <Chip className="-left-2 top-[24%] sm:-left-6" icon={BellRing}>{t('mk.hero.chipOrders')}</Chip>
            <Chip className="right-0 top-[22%] hidden sm:flex lg:-right-2" icon={QrCode}>{t('mk.hero.chipQr')}</Chip>
            <Chip className="bottom-3 left-[6%]" icon={ReceiptText}>{t('mk.hero.chipGst')}</Chip>
          </motion.div>
        </div>
      </section>

      {/* Why */}
      <section className="border-y border-line bg-surface py-16 sm:py-20" aria-labelledby="why-h">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Heading id="why-h" title={t('mk.why.title')} center />
          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            {([['own', Users], ['look', Palette], ['run', Store]] as const).map(([k, Icon]) => (
              <article key={k} className="rounded-3xl border border-line bg-paper p-6 sm:p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-gold">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-xl font-extrabold">{t(`mk.why.items.${k}.title`)}</h3>
                <p className="mt-2 text-muted">{t(`mk.why.items.${k}.text`)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Product: dashboard + modules */}
      <section id="features" className="py-16 sm:py-24" aria-labelledby="modules-h">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Heading id="modules-h" title={t('mk.modules.title')} lead={t('mk.modules.lead')} center />
          <BrowserFrame src={dashboardPos} alt={t('mk.f.pos.title')} url={`${PLATFORM_DOMAIN}/dashboard/pos`} className="mx-auto mt-10 max-w-5xl" />
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {MODULES.map(({ key, icon: Icon }) => {
              const to = featurePath(key);
              const body = (
                <>
                  <Icon className="h-6 w-6 text-brand" aria-hidden="true" />
                  <h3 className="mt-4 font-extrabold">{t(`mk.modules.items.${key}.title`)}</h3>
                  <p className="mt-1.5 text-sm text-muted">{t(`mk.modules.items.${key}.text`)}</p>
                  {to && (
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-brand-strong">
                      {t('mk.modules.learnMore')}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  )}
                </>
              );
              return to ? (
                <Link key={key} to={to} className="group rounded-2xl border border-line bg-surface p-5 transition-shadow hover:shadow-lg">
                  {body}
                </Link>
              ) : (
                <div key={key} className="rounded-2xl border border-line bg-surface p-5">
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Themes */}
      <section className="border-y border-line bg-surface py-16 sm:py-24" aria-labelledby="themes-h">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Heading id="themes-h" title={t('mk.themes.title')} lead={t('mk.themes.lead')} />
            <Link to="/themes" className="btn-outline">
              {t('mk.themes.all')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-10">
            <ThemeGrid limit={3} />
          </div>
          <p className="mt-4 text-sm text-muted">{t('mk.themes.demoNote')}</p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-24" aria-labelledby="how-h">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Heading id="how-h" title={t('mk.how.title')} center />
          <ol className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="relative rounded-3xl border border-line bg-surface p-6 sm:p-7">
                <span className="text-5xl font-extrabold text-brand/25 tabular-nums" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-3 text-xl font-extrabold">{s.title}</h3>
                <p className="mt-2 text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Made for India */}
      <section className="px-4 sm:px-6" aria-labelledby="india-h">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 rounded-[2rem] bg-brand-soft px-6 py-12 sm:px-12 sm:py-16 lg:grid-cols-[1fr_1.2fr]">
          <Heading id="india-h" title={t('mk.india.title')} lead={t('mk.india.lead')} />
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {india.map((item) => (
              <li key={item} className="flex gap-3 rounded-2xl bg-surface/80 p-4 font-semibold">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 sm:py-24" aria-labelledby="plans-h">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Heading id="plans-h" title={t('mk.pricing.title')} lead={t('mk.pricing.lead')} center />
          <div className="mt-10">
            <Plans />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-20" aria-labelledby="faq-h">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Heading id="faq-h" title={t('mk.faq.title')} center />
          <div className="mt-8">
            <Faq items={faq} />
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

function Chip({ icon: Icon, className, children }: { icon: typeof Check; className: string; children: React.ReactNode }) {
  return (
    <span className={`absolute flex items-center gap-2 rounded-full border border-line bg-surface/95 px-3.5 py-2 text-xs font-bold shadow-lg backdrop-blur sm:text-sm ${className}`} aria-hidden="true">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
        <Icon className="h-3.5 w-3.5" />
      </span>
      {children}
    </span>
  );
}
