import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { animate, AnimatePresence, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { ArrowRight, BellRing, Check, CheckCircle2, Palette, PlayCircle, QrCode, ReceiptText, Sparkles, Store, Users } from 'lucide-react';
import { PLATFORM_DOMAIN, tenantSiteUrl } from '@/lib/host';
import { featurePath, MODULES } from './content';
import { CtaBand, Faq, Heading, Plans, ThemeShowcase, useTrialNote } from './parts';
import { DEMO_SLUG } from './content';
import { THEME_KEYS, THEMES } from '@/themes/registry';
import type { ThemeKey } from '@/themes/types';
import { marketingHead, usePageMeta } from './seo';
import { SavingsCalculator } from './Savings';
import coastalDesktop from './assets/hero/coastal-desktop.webp';
import coastalPhone from './assets/hero/coastal-phone.webp';
import emberDesktop from './assets/hero/ember-desktop.webp';
import emberPhone from './assets/hero/ember-phone.webp';
import rajwadaDesktop from './assets/hero/rajwada-desktop.webp';
import rajwadaPhone from './assets/hero/rajwada-phone.webp';
import bistroDesktop from './assets/hero/bistro-desktop.webp';
import bistroPhone from './assets/hero/bistro-phone.webp';
import kulhadDesktop from './assets/hero/kulhad-desktop.webp';
import kulhadPhone from './assets/hero/kulhad-phone.webp';
import dashboardPos from './assets/dashboard-pos.webp';

/** True when this visit started from the pre-rendered HTML (see scripts/prerender.mjs). */
const PRERENDERED = typeof document !== 'undefined' && !!document.getElementById('prerender');
const EASE = [0.22, 1, 0.36, 1] as const;
/** No entrance animation while pre-rendering, on a pre-rendered visit (the content is already on screen) or with reduced motion. */
const still = (reduce: boolean | null) => !!reduce || PRERENDERED || import.meta.env.SSR;

/** A screenshot in a simple browser window frame. */
export function BrowserFrame({ src, alt, url, className = '', eager = false, dark = false }: { src: string; alt: string; url: string; className?: string; eager?: boolean; dark?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-2xl border shadow-2xl ${dark ? 'border-white/10 bg-[#1a1613] shadow-black/50' : 'border-line bg-surface shadow-ink/15'} ${className}`}>
      <div className={`flex h-9 items-center gap-2 border-b px-3 ${dark ? 'border-white/10 bg-[#211c18]' : 'border-line bg-paper'}`} aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className={`ml-3 hidden max-w-xs flex-1 truncate rounded-md px-3 py-0.5 text-center text-[11px] sm:block ${dark ? 'bg-white/5 text-white/60' : 'bg-surface text-muted'}`}>{url}</span>
      </div>
      <img src={src} alt={alt} width={1440} height={900} loading={eager ? 'eager' : 'lazy'} {...(eager ? { fetchpriority: 'high' } : {})} className="block w-full" />
    </div>
  );
}

/** Fades a block in as it scrolls into view (static when pre-rendered or with reduced motion). */
function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  if (still(reduce)) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.7, delay, ease: EASE }}>
      {children}
    </motion.div>
  );
}

/** Cursor spotlight for .mk-spot cards. */
function spot(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
}

/** "Your website, orders and billing. All in one place." → the second sentence gets the gradient (any script's full stop). */
function splitTitle(title: string): [string, string] {
  const m = /^(.+?[.।!?。])\s+(.+)$/u.exec(title);
  return m ? [m[1], m[2]] : [title, ''];
}

export default function Landing() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const trial = useTrialNote();
  const faq = t('mk.faq.items', { returnObjects: true }) as { q: string; a: string }[];
  const steps = t('mk.how.steps', { returnObjects: true }) as { title: string; text: string }[];
  const india = t('mk.india.items', { returnObjects: true }) as string[];
  const points = t('mk.hero.points', { returnObjects: true }) as string[];
  const [titleA, titleB] = splitTitle(t('mk.hero.title'));
  usePageMeta(marketingHead('/', t));
  const rise = (i: number) => (still(reduce) ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay: 0.08 * i, ease: EASE } });

  return (
    <>
      {/* Hero: a dark stage inside the page, with moving light, a grid and grain behind the copy. */}
      <section className="px-2 pt-2 sm:px-4 sm:pt-4">
        <div className="mk-stage relative overflow-hidden rounded-[1.75rem] text-white sm:rounded-[2.25rem]">
          <div className="mk-aurora -left-24 -top-32 h-[28rem] w-[28rem] bg-[#c2410c]" aria-hidden="true" />
          <div className="mk-aurora right-[-8rem] top-10 h-[24rem] w-[24rem] bg-[#f2b544] [animation-delay:-6s]" aria-hidden="true" />
          <div className="mk-aurora bottom-[-10rem] left-1/3 h-[22rem] w-[22rem] bg-[#be123c] opacity-40 [animation-delay:-12s]" aria-hidden="true" />
          <div className="mk-grid" aria-hidden="true" />
          <div className="mk-grain" aria-hidden="true" />

          <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-5 pb-12 pt-10 sm:px-8 sm:pt-16 lg:grid-cols-[1.08fr_1fr] lg:gap-8 lg:pb-16">
            <div>
              <motion.p {...rise(0)} className="mk-glass inline-flex items-center gap-2.5 rounded-full px-3.5 py-1.5 text-xs font-bold text-white/85 sm:text-sm">
                <span className="mk-pulse h-2 w-2 rounded-full bg-[#4ade80]" aria-hidden="true" />
                {t('mk.hero.eyebrow')}
              </motion.p>
              <motion.h1 {...rise(1)} className="mt-6 text-[2.4rem] font-extrabold leading-[1.04] tracking-tight sm:text-[3.4rem] lg:text-[3.55rem]">
                {titleA}
                {titleB && (
                  <>
                    {' '}
                    <span className="mk-gradient-text">{titleB}</span>
                  </>
                )}
              </motion.h1>
              <motion.p {...rise(2)} className="mt-5 max-w-xl text-lg leading-relaxed text-white/72">
                {t('mk.hero.lead')}
              </motion.p>
              <motion.div {...rise(3)} className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/signup" className="btn-brand mk-glow mk-shine group !px-7 text-base">
                  {t('mk.hero.primary')}
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </Link>
                <Link to="/demo" className="mk-glass inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-base font-bold text-white transition-colors hover:bg-white/12">
                  <PlayCircle className="h-5 w-5 text-[#ffb36b]" aria-hidden="true" />
                  {t('mk.nav.demo')}
                </Link>
                <Link to="/themes" className="inline-flex min-h-12 items-center px-2 text-base font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline">
                  {t('mk.hero.secondary')}
                </Link>
              </motion.div>
              {trial && (
                <motion.p {...rise(4)} className="mt-4 text-sm text-white/60">
                  {trial}
                </motion.p>
              )}
              <motion.ul {...rise(5)} className="mt-7 flex flex-wrap gap-x-6 gap-y-2.5 text-sm font-semibold text-white/85">
                {points.map((p) => (
                  <li key={p} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#4ade80]" aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </motion.ul>
            </div>

            <motion.div {...rise(2)}>
              <HeroVisual />
            </motion.div>
          </div>

          <FeatureMarquee />
        </div>
      </section>

      <FactsBand />

      {/* Why */}
      <section className="py-16 sm:py-24" aria-labelledby="why-h">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <Heading id="why-h" title={t('mk.why.title')} center />
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            {([['own', Users, 'from-[#c2410c] to-[#f2b544]'], ['look', Palette, 'from-[#be123c] to-[#fb923c]'], ['run', Store, 'from-[#14110f] to-[#57534e]']] as const).map(([k, Icon, tile], i) => (
              <Reveal key={k} delay={0.08 * i}>
                <article onPointerMove={spot} className="mk-spot h-full rounded-3xl border border-line bg-surface p-7 transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-ink/5">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${tile} text-white shadow-lg`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-6 text-xl font-extrabold">{t(`mk.why.items.${k}.title`)}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{t(`mk.why.items.${k}.text`)}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Product: dashboard + modules */}
      <section id="features" className="relative overflow-hidden border-y border-line bg-surface py-16 sm:py-24" aria-labelledby="modules-h">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <Heading id="modules-h" title={t('mk.modules.title')} lead={t('mk.modules.lead')} center />
          </Reveal>
          <Reveal className="relative mx-auto mt-12 max-w-5xl">
            <div className="pointer-events-none absolute -inset-x-10 -bottom-10 top-16 rounded-[3rem] bg-[radial-gradient(60%_60%_at_50%_40%,color-mix(in_srgb,var(--dd-brand)_22%,transparent),transparent_70%)] blur-2xl" aria-hidden="true" />
            <BrowserFrame src={dashboardPos} alt={t('mk.f.pos.title')} url={`${PLATFORM_DOMAIN}/dashboard/pos`} className="relative" />
          </Reveal>
          <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {MODULES.map(({ key, icon: Icon }, i) => {
              const to = featurePath(key);
              const body = (
                <>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand-strong transition-colors group-hover:bg-brand group-hover:text-white">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-extrabold">{t(`mk.modules.items.${key}.title`)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(`mk.modules.items.${key}.text`)}</p>
                  {to && (
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-brand-strong">
                      {t('mk.modules.learnMore')}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </span>
                  )}
                </>
              );
              const card = 'mk-spot group block h-full rounded-2xl border border-line bg-paper p-5 transition-all duration-300 hover:-translate-y-1 hover:border-brand/30 hover:shadow-xl hover:shadow-ink/5';
              return (
                <Reveal key={key} delay={0.05 * (i % 5)}>
                  {to ? (
                    <Link to={to} onPointerMove={spot} className={card}>
                      {body}
                    </Link>
                  ) : (
                    <div onPointerMove={spot} className={card}>
                      {body}
                    </div>
                  )}
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Themes */}
      <section className="py-16 sm:py-24" aria-labelledby="themes-h">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal className="flex flex-wrap items-end justify-between gap-4">
            <Heading id="themes-h" title={t('mk.themes.title')} lead={t('mk.themes.lead')} />
            <Link to="/themes" className="btn-outline group">
              {t('mk.themes.all')}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </Reveal>
          <Reveal className="mt-10 pb-6">
            <ThemeShowcase />
          </Reveal>
          <p className="mt-4 text-sm text-muted">{t('mk.themes.demoNote')}</p>
        </div>
      </section>

      {/* How it works: a connected three-step line */}
      <section className="border-y border-line bg-surface py-16 sm:py-24" aria-labelledby="how-h">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <Heading id="how-h" title={t('mk.how.title')} center />
          </Reveal>
          <ol className="relative mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            <span className="pointer-events-none absolute left-[16%] right-[16%] top-[2.6rem] hidden h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent md:block" aria-hidden="true" />
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={0.1 * i}>
                <li onPointerMove={spot} className="mk-spot relative h-full rounded-3xl border border-line bg-paper p-7">
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-ink text-lg font-extrabold text-gold tabular-nums shadow-lg" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-xl font-extrabold">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{s.text}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Made for India */}
      <section className="px-4 py-16 sm:px-6 sm:py-24" aria-labelledby="india-h">
        <Reveal className="relative mx-auto grid max-w-6xl grid-cols-1 gap-10 overflow-hidden rounded-[2rem] bg-brand-soft px-6 py-12 sm:px-12 sm:py-16 lg:grid-cols-[1fr_1.2fr]">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/15 blur-3xl" aria-hidden="true" />
          <Heading id="india-h" title={t('mk.india.title')} lead={t('mk.india.lead')} />
          <ul className="relative grid grid-cols-1 gap-3 sm:grid-cols-2">
            {india.map((item) => (
              <li key={item} className="flex gap-3 rounded-2xl bg-surface/85 p-4 font-semibold shadow-sm transition-transform duration-300 hover:-translate-y-0.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* Savings: what delivery-app commission costs vs the plan */}
      <section id="savings" className="pb-16 sm:pb-24" aria-labelledby="savings-h">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <Heading id="savings-h" title={t('mk.savings.title')} lead={t('mk.savings.lead')} center />
          </Reveal>
          <Reveal className="mt-10">
            <SavingsCalculator />
          </Reveal>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="pb-16 sm:pb-24" aria-labelledby="plans-h">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <Heading id="plans-h" title={t('mk.pricing.title')} lead={t('mk.pricing.lead')} center />
          </Reveal>
          <Reveal className="mt-10">
            <Plans />
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-20" aria-labelledby="faq-h">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Reveal>
            <Heading id="faq-h" title={t('mk.faq.title')} center />
          </Reveal>
          <div className="mt-8">
            <Faq items={faq} />
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

/** Sample orders for the live card (dish names and amounts only; the labels are translated). */
const ORDERS = [
  { n: 1024, table: 4, items: 'Paneer Tikka × 2 · Butter Naan', total: '₹1,092' },
  { n: 1025, table: 7, items: 'Masala Dosa · Filter Coffee', total: '₹318' },
  { n: 1026, table: 2, items: 'Laal Maas · Jeera Rice', total: '₹612' },
];

/** Hero slides: the same demo website on a laptop and a phone (screenshots taken from the demo sites). */
const SLIDES: { key: ThemeKey; desktop: string; phone: string }[] = [
  { key: 'coastal', desktop: coastalDesktop, phone: coastalPhone },
  { key: 'ember', desktop: emberDesktop, phone: emberPhone },
  { key: 'rajwada', desktop: rajwadaDesktop, phone: rajwadaPhone },
  { key: 'bistro', desktop: bistroDesktop, phone: bistroPhone },
  { key: 'kulhad', desktop: kulhadDesktop, phone: kulhadPhone },
];
const SLIDE_MS = 5000;

/**
 * The hero picture: a slider of real demo websites on a laptop and a phone in 3D, with live
 * interface cards built in HTML on top (sharp at any size, translated). Moves on every few seconds
 * (paused while pointed at or once a slide is picked; still with reduced motion) and tilts a little
 * towards the cursor on desktop.
 */
function HeroVisual() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [order, setOrder] = useState(0);
  const [slide, setSlide] = useState(0);
  const [held, setHeld] = useState(false);
  const [picked, setPicked] = useState(false);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-14, 2]), { stiffness: 120, damping: 18 });
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [10, 0]), { stiffness: 120, damping: 18 });
  const sliding = !reduce && !held && !picked;
  const current = SLIDES[slide];
  const host = tenantSiteUrl(DEMO_SLUG[current.key]).replace(/^https?:\/\//, '');

  useEffect(() => {
    if (reduce) return undefined;
    const id = setInterval(() => setOrder((o) => (o + 1) % ORDERS.length), 3400);
    return () => clearInterval(id);
  }, [reduce]);

  useEffect(() => {
    if (!sliding) return undefined;
    const id = setTimeout(() => setSlide((i) => (i + 1) % SLIDES.length), SLIDE_MS);
    return () => clearTimeout(id);
  }, [sliding, slide]);

  // Fetch the next slide's pictures quietly, so the change is instant.
  useEffect(() => {
    const next = SLIDES[(slide + 1) % SLIDES.length];
    for (const src of [next.desktop, next.phone]) new Image().src = src;
  }, [slide]);

  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const leave = () => {
    mx.set(0);
    my.set(0);
    setHeld(false);
  };
  const o = ORDERS[order];
  const fade = { initial: reduce ? false : { opacity: 0, scale: 1.03 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0 }, transition: { duration: 0.7, ease: EASE } } as const;

  return (
    <div onPointerEnter={() => setHeld(true)} onPointerLeave={leave}>
    <div className="relative mx-auto w-full max-w-xl px-3 pt-6 [perspective:1600px] sm:px-6 lg:max-w-none" onPointerMove={move} role="img" aria-label={t('mk.hero.visualAlt')}>
      <motion.div style={reduce ? { rotateY: -6, rotateX: 5 } : { rotateY, rotateX }} className="relative pb-14 pr-6 [transform-style:preserve-3d] sm:pr-10">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#1a1613] shadow-2xl shadow-black/50">
          <div className="flex h-9 items-center gap-2 border-b border-white/10 bg-[#211c18] px-3" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-3 hidden max-w-xs flex-1 truncate rounded-md bg-white/5 px-3 py-0.5 text-center text-[11px] text-white/60 sm:block">{host}</span>
          </div>
          <div className="relative aspect-[16/10] bg-[#1a1613]">
            <AnimatePresence initial={false}>
              <motion.img key={current.key} src={current.desktop} alt="" width={2160} height={1350} {...(slide === 0 ? { fetchpriority: 'high' } : {})} className="absolute inset-0 h-full w-full object-cover object-top" {...fade} />
            </AnimatePresence>
          </div>
        </div>
        {/* The phone sits over the browser's bottom-right corner, a little nearer. */}
        <div className="absolute bottom-0 right-0 w-[24%] max-w-[156px] overflow-hidden rounded-[1.5rem] border-[5px] border-[#0b0908] bg-[#0b0908] shadow-2xl shadow-black/60 [transform:translateZ(60px)]">
          <div className="relative aspect-[390/844]">
            <AnimatePresence initial={false}>
              <motion.img key={current.key} src={current.phone} alt="" width={780} height={1688} className="absolute inset-0 h-full w-full object-cover object-top" {...fade} />
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Live order: a new one slides in every few seconds. */}
      <div className="mk-float absolute left-0 top-0 w-[min(15.5rem,70%)]" aria-hidden="true">
        <div className="mk-card overflow-hidden rounded-2xl p-3.5">
          <div className="flex items-center gap-2.5">
            <span className="mk-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
              <BellRing className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand-strong">{t('mk.hero.live.newOrder')}</p>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.p key={o.n} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="truncate text-sm font-extrabold">
                  #{o.n} · {t('mk.hero.live.table', { n: o.table })}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={o.n} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2 text-xs">
              <span className="truncate text-muted">{o.items}</span>
              <span className="shrink-0 font-extrabold">{o.total}</span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* QR table card */}
      <div className="mk-float absolute right-0 top-[34%] hidden [animation-delay:-2s] sm:block" aria-hidden="true">
        <div className="mk-card flex items-center gap-3 rounded-2xl p-3 pr-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-gold">
            <QrCode className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-extrabold">{t('mk.hero.live.scan')}</p>
            <p className="text-xs text-muted">{t('mk.hero.live.table', { n: 4 })}</p>
          </div>
        </div>
      </div>

      {/* GST bill */}
      <div className="mk-float absolute bottom-0 left-0 w-[min(13.5rem,62%)] [animation-delay:-4s] sm:left-[3%]" aria-hidden="true">
        <div className="mk-card rounded-2xl p-3.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-extrabold">
              <ReceiptText className="h-4 w-4 text-brand" />
              {t('mk.hero.live.bill')}
            </span>
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success">{t('mk.hero.live.paid')} · UPI</span>
          </div>
          <dl className="mt-2.5 space-y-1 tabular-nums text-muted">
            <div className="flex justify-between"><dt>CGST 2.5%</dt><dd>₹25.65</dd></div>
            <div className="flex justify-between"><dt>SGST 2.5%</dt><dd>₹25.65</dd></div>
            <div className="flex justify-between border-t border-dashed border-line pt-1.5 text-sm font-extrabold text-ink"><dt>{t('mk.hero.live.total')}</dt><dd>₹1,092</dd></div>
          </dl>
        </div>
      </div>
    </div>

    {/* Pick a theme: one pill per slide, the current one with its timer. */}
    <div className="relative mt-5 flex flex-wrap justify-center gap-1.5" role="group" aria-label={t('mk.themes.title')}>
      {SLIDES.map((sl, i) => {
        const on = i === slide;
        return (
          <button
            key={sl.key}
            type="button"
            aria-pressed={on}
            onClick={() => {
              setSlide(i);
              setPicked(true);
            }}
            className={`relative overflow-hidden rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${on ? 'bg-white text-[#14110f]' : 'bg-white/8 text-white/70 hover:bg-white/15 hover:text-white'}`}
          >
            {THEMES[sl.key].name}
            {on && sliding && <span key={slide} className="mk-progress absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[#c2410c]" style={{ animationDuration: `${SLIDE_MS}ms` }} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
    </div>
  );
}

/** What NikoBite does, scrolling along the bottom of the hero (paused on hover, still with reduced motion). */
function FeatureMarquee() {
  const { t } = useTranslation();
  const india = t('mk.india.items', { returnObjects: true }) as string[];
  const items = [...MODULES.map(({ key }) => t(`mk.modules.items.${key}.title`)), ...india];
  const row = (copy: number) =>
    items.map((label, i) => (
      <span key={`${copy}-${i}`} className="flex shrink-0 items-center gap-3 px-5 text-sm font-semibold text-white/70">
        <Sparkles className="h-3.5 w-3.5 text-[#f2b544]" />
        {label}
      </span>
    ));
  return (
    <div className="mk-marquee relative overflow-hidden border-t border-white/10 py-4" aria-hidden="true">
      <div className="mk-marquee-track">
        {row(0)}
        {row(1)}
      </div>
    </div>
  );
}

/** Counts up to a number when it scrolls into view (shows the number straight away when still). */
function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const [n, setN] = useState(() => (still(reduce) || to === 0 ? to : 0));
  useEffect(() => {
    if (!inView || still(reduce) || to === 0) return undefined;
    const controls = animate(0, to, { duration: 1.4, ease: EASE, onUpdate: (v) => setN(Math.round(v)) });
    return () => controls.stop();
  }, [inView, reduce, to]);
  return (
    <span ref={ref} className="tabular-nums">
      {n}
      {suffix}
    </span>
  );
}

/** Plain facts about NikoBite (no invented customer numbers). */
function FactsBand() {
  const { t } = useTranslation();
  const facts: { value: ReactNode; label: string }[] = [
    { value: <CountUp to={THEME_KEYS.length} />, label: t('mk.facts.themes') },
    { value: <CountUp to={12} />, label: t('mk.facts.languages') },
    { value: <CountUp to={0} suffix="%" />, label: t('mk.facts.commission') },
    { value: '24×7', label: t('mk.facts.always') },
  ];
  return (
    <section className="px-4 pt-10 sm:px-6 sm:pt-14" aria-label={t('mk.facts.label')}>
      <Reveal>
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line lg:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="flex flex-col items-center gap-1 bg-surface px-4 py-7 text-center sm:py-9">
              <dt className="order-2 text-sm font-semibold text-muted">{f.label}</dt>
              <dd className="order-1 bg-gradient-to-br from-[#c2410c] to-[#d97706] bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">{f.value}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </section>
  );
}
