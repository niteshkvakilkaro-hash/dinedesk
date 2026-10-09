import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, MapPin, Phone } from 'lucide-react';
import { gsap, ScrollTrigger, useDesktopPointer, useGsap } from '@/site/motion';
import { useReduceMotion } from '@/stores/motion';
import { featuredItems, formatPrice, mapHref, telHref, useLocalized, useOpenStatus, useSiteGallery, useSiteMenu } from '@/site/data';
import { FoodTypeMark, SiteImg, SpiceLevel, useOpenLabel } from '@/site/components/bits';
import { artFor, FoodArt } from '@/site/components/FoodArt';
import { ContactList, HoursTable, Lightbox, Paragraphs, useGalleryFilter, useHomeSections, useMenuFilter } from '@/site/components/shared';
import type { MenuItem, SiteData } from '@/site/types';
import type { PageProps } from '../../types';
import { CurtainReveal, Diya, Jaali, JHAROKHA_CLIP, LotusDivider, useWordRise } from './ornaments';

const artStyle = { '--art-ink': '#2B2118', '--art-a': '#E8C987', '--art-b': '#9A3B2E' } as React.CSSProperties;

function OpenBadge({ site, light = false }: { site: SiteData; light?: boolean }) {
  const status = useOpenLabel(useOpenStatus(site));
  if (!status) return null;
  return (
    <p className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold ${light ? 'bg-[#FFF8E9] text-[#2B2118]' : 'bg-t-surface text-t-text ring-1 ring-t-line'}`} aria-live="polite">
      <span className={`h-2.5 w-2.5 rounded-full ${status.open ? 'bg-[#15803d]' : 'bg-[#9A3B2E]'}`} aria-hidden="true" />
      {status.label}
      {status.detail && <span className="font-normal">· {status.detail}</span>}
    </p>
  );
}

function SectionTitle({ eyebrow, title, light = false, id }: { eyebrow?: string; title: string; light?: boolean; id?: string }) {
  return (
    <div className="text-center">
      {eyebrow && <p className={`text-sm font-semibold uppercase tracking-[0.2em] ${light ? 'text-[#F1E2BC]' : 'text-t-muted'}`}>{eyebrow}</p>}
      <h2 id={id} data-rise className={`mt-2 text-4xl leading-tight sm:text-5xl ${light ? 'text-[#FFF8E9]' : 'text-t-primary'}`}>
        {title}
      </h2>
      <LotusDivider light={light} className="mt-4" />
    </div>
  );
}

function DishArt({ item, className = '' }: { item: MenuItem; className?: string }) {
  const l = useLocalized();
  if (item.image) return <SiteImg image={item.image} alt={l(item, 'name') ?? item.name} sizes="(min-width: 768px) 30vw, 90vw" className={className} />;
  return (
    <span className={`flex items-center justify-center bg-[var(--t-x-goldSoft)] ${className}`} style={artStyle}>
      <FoodArt art={artFor(item.name)} className="h-1/2 w-1/2" />
    </span>
  );
}

function PageHeader({ title, eyebrow }: { title: string; eyebrow?: string }) {
  const ref = useRef<HTMLElement>(null);
  useWordRise(ref, [title]);
  return (
    <section ref={ref} className="relative overflow-hidden bg-t-primary px-4 py-14 text-center text-[#FFF8E9] sm:py-20">
      <Jaali opacity={0.22} />
      <div className="relative">
        {eyebrow && <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#F1E2BC]">{eyebrow}</p>}
        <h1 data-rise className="mt-2 text-5xl leading-tight sm:text-6xl">
          {title}
        </h1>
        <LotusDivider light className="mt-4" />
      </div>
    </section>
  );
}

function MenuRow({ item }: { item: MenuItem }) {
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  return (
    <li className={`flex gap-4 py-4 ${item.is_available ? '' : 'opacity-60'}`}>
      <DishArt item={item} className="h-20 w-20 shrink-0 rounded-t-full" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <FoodTypeMark type={item.food_type} className="translate-y-0.5" />
          <h3 className="min-w-0 flex-1 font-body text-lg font-semibold leading-snug">{l(item, 'name')}</h3>
          <span className="whitespace-nowrap font-semibold tabular-nums text-t-primary">{formatPrice(item.price, i18n.language)}</span>
        </div>
        {l(item, 'description') && <p className="mt-1 text-[15px] text-t-muted">{l(item, 'description')}</p>}
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold">
          {item.is_chefs_special && <span className="rounded-full bg-t-primary px-2 py-0.5 text-[#FFF8E9]">{t('site.chefsSpecial')}</span>}
          {item.is_bestseller && <span className="rounded-full bg-[var(--t-x-goldSoft)] px-2 py-0.5 text-[#2B2118]">{t('site.bestseller')}</span>}
          {!item.is_available && <span className="rounded-full bg-t-text px-2 py-0.5 text-t-bg">{t('site.unavailable')}</span>}
          <SpiceLevel level={item.spice_level} />
          {item.is_demo && <span className="rounded border border-t-line px-1.5 py-0.5 text-t-muted">{t('common.demo')}</span>}
        </p>
      </div>
    </li>
  );
}

/* ───────────────────────── Home ───────────────────────── */

function Hero({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const l = useLocalized();
  return (
    <section className="relative overflow-hidden bg-t-primary text-[#FFF8E9]" aria-labelledby="hero-title">
      <Jaali opacity={0.2} />
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.1fr_1fr] md:py-20">
        <div className="text-center md:text-left">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#F1E2BC]">
            {t(`types.${site.business_type}`)}
            {site.city && ` · ${site.city}`}
          </p>
          <h1 id="hero-title" data-rise className="mt-3 text-5xl leading-[1.05] sm:text-7xl">
            {site.name}
          </h1>
          {l(site.content, 'tagline') && <p className="mt-4 text-lg text-[#F1E2BC] sm:text-xl">{l(site.content, 'tagline')}</p>}
          <div className="mt-6">
            <OpenBadge site={site} light />
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3 md:justify-start">
            {site.has_menu && (
              <Link to="/menu" className="inline-flex min-h-12 items-center gap-2 rounded-t px-6 font-semibold text-[#2B2118] transition-transform duration-300 hover:-translate-y-0.5" style={{ background: 'var(--t-accent)' }}>
                {t('site.viewMenu')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
            <a href={mapHref(site)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-t border border-[#E9D3A0] px-6 font-semibold text-[#FFF8E9] hover:bg-white/10">
              <MapPin className="h-4 w-4" aria-hidden="true" /> {t('site.directions')}
            </a>
          </div>
        </div>
        <div className="mx-auto w-full max-w-sm md:max-w-md">
          <div data-hero-media className="relative aspect-[4/5] w-full overflow-hidden" style={{ clipPath: JHAROKHA_CLIP }}>
            {site.theme.cover ? (
              <SiteImg image={site.theme.cover} alt={t('site.coverAlt', { name: site.name })} sizes="(min-width: 768px) 40vw, 90vw" className="h-full w-full" priority />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[var(--t-x-goldSoft)]" style={artStyle}>
                <FoodArt art="thali" className="h-1/2 w-1/2" />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Specials({ site }: { site: SiteData }) {
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  const { data: menu } = useSiteMenu();
  const items = featuredItems(menu, 6);
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="specials-title">
      <SectionTitle id="specials-title" eyebrow={t('site.fromKitchen')} title={t('site.specialsTitle')} />
      <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.id} className="text-center">
            <CurtainReveal className="mx-auto aspect-[4/5] w-full max-w-[280px] rounded-t-full">
              <DishArt item={item} className="h-full w-full" />
            </CurtainReveal>
            <h3 className="mt-4 flex items-center justify-center gap-2 font-body text-lg font-semibold">
              <FoodTypeMark type={item.food_type} /> {l(item, 'name')}
            </h3>
            <p className="font-semibold text-t-primary">{formatPrice(item.price, i18n.language)}</p>
            {item.is_demo && <p className="text-xs text-t-muted">{t('common.demo')}</p>}
          </li>
        ))}
      </ul>
      {site.has_menu && (
        <p className="mt-10 text-center">
          <Link to="/menu" className="inline-flex min-h-11 items-center gap-2 font-semibold text-t-primary underline decoration-t-accent decoration-2 underline-offset-8">
            {t('site.fullMenu')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </p>
      )}
    </section>
  );
}

function Story({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const about = l(site.content, 'about');
  return (
    <section className="bg-t-surface" aria-labelledby="story-title">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2">
        <CurtainReveal className="aspect-square w-full rounded-t-full">
          {site.theme.cover ? (
            <SiteImg image={site.theme.cover} alt={t('site.coverAlt', { name: site.name })} sizes="(min-width: 768px) 45vw, 90vw" className="h-full w-full" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[var(--t-x-goldSoft)]">
              <Diya className="h-1/2 w-1/2" />
            </div>
          )}
        </CurtainReveal>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-t-muted">{t('site.ourStory')}</p>
          <h2 id="story-title" data-rise className="mt-2 text-4xl text-t-primary sm:text-5xl">
            {site.name}
          </h2>
          <div className="mt-4 space-y-3 text-lg leading-relaxed">{about ? <Paragraphs text={about.split(/\n{2,}/)[0]} /> : <p className="text-t-muted">{t('site.noStory', { name: site.name })}</p>}</div>
          <Link to="/about" className="mt-6 inline-flex min-h-11 items-center gap-2 font-semibold text-t-primary underline decoration-t-accent decoration-2 underline-offset-8">
            {t('site.readStory')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function MenuPreview() {
  const { t } = useTranslation();
  const l = useLocalized();
  const { data: menu } = useSiteMenu();
  if (!menu?.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="menu-preview-title">
      <SectionTitle id="menu-preview-title" eyebrow={t('site.nav.menu')} title={t('site.menuPreviewTitle')} />
      <div className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
        {menu.slice(0, 4).map((c) => (
          <div key={c.id}>
            <h3 className="border-b border-t-line pb-2 text-2xl text-t-primary">{l(c, 'name')}</h3>
            <ul className="divide-y divide-t-line/70">
              {c.items.slice(0, 3).map((i) => (
                <MenuRow key={i.id} item={i} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center">
        <Link to="/menu" className="inline-flex min-h-12 items-center gap-2 rounded-t bg-t-primary px-6 font-semibold text-t-on-primary">
          {t('site.fullMenu')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </p>
    </section>
  );
}

function GalleryStrip() {
  const { t } = useTranslation();
  const { data } = useSiteGallery();
  const items = (data ?? []).slice(0, 6);
  if (!items.length) return null;
  return (
    <section className="bg-t-surface py-16" aria-labelledby="gallery-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle id="gallery-title" eyebrow={t('site.nav.gallery')} title={t('site.galleryTitle')} />
        <ul className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3">
          {items.map((g) => (
            <li key={g.id}>
              <CurtainReveal className="aspect-square">{g.image && <SiteImg image={g.image} alt={g.alt_text} sizes="(min-width: 768px) 30vw, 45vw" className="h-full w-full" />}</CurtainReveal>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-center">
          <Link to="/gallery" className="inline-flex min-h-11 items-center gap-2 font-semibold text-t-primary underline decoration-t-accent decoration-2 underline-offset-8">
            {t('site.seeGallery')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </p>
      </div>
    </section>
  );
}

function Hours({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const status = useOpenStatus(site);
  return (
    <section className="relative overflow-hidden bg-t-primary text-[#FFF8E9]" aria-labelledby="hours-title">
      <Jaali opacity={0.18} />
      <div className="relative mx-auto grid max-w-5xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-[auto_1fr]">
        <Diya className="mx-auto h-32 w-32 md:h-44 md:w-44" />
        <div>
          <h2 id="hours-title" data-rise className="text-4xl sm:text-5xl">
            {t('site.hours')}
          </h2>
          <div className="mt-4">
            <OpenBadge site={site} light />
          </div>
          <HoursTable site={site} status={status} className="mt-6 max-w-md text-[17px]" rowClassName="border-b border-white/15 py-2 text-[#F1E2BC]" todayClassName="!text-[#FFF8E9] font-semibold" />
        </div>
      </div>
    </section>
  );
}

function Visit({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6" aria-labelledby="visit-title">
      <SectionTitle id="visit-title" eyebrow={t('site.findUs')} title={t('site.visitTitle')} />
      <ContactList site={site} className="mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-2" itemClassName="flex min-h-14 items-center gap-3 rounded-t border border-t-line bg-t-surface p-4 hover:border-t-primary" iconClassName="h-5 w-5 text-t-primary" />
    </section>
  );
}

function Home({ site }: PageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const sections = useHomeSections(site);
  useWordRise(ref, [sections.join()]);
  const render = {
    specials: <Specials site={site} />,
    story: <Story site={site} />,
    menu_preview: <MenuPreview />,
    gallery: <GalleryStrip />,
    hours: <Hours site={site} />,
    visit: <Visit site={site} />,
  };
  return (
    <div ref={ref}>
      <Hero site={site} />
      {sections.map((key) => (
        <div key={key}>{render[key]}</div>
      ))}
    </div>
  );
}

/* ───────────────────────── Menu ───────────────────────── */

function MenuPage({ site }: PageProps) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { data: menu, isLoading } = useSiteMenu();
  const { categories, vegOnly, setVegOnly, hasDemo } = useMenuFilter(menu);
  return (
    <>
      <PageHeader title={t('site.nav.menu')} eyebrow={site.name} />
      <div className="sticky top-[61px] z-30 border-b border-t-line bg-t-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 sm:px-6">
          <nav aria-label={t('site.categories')} className="min-w-0 flex-1 overflow-x-auto">
            <ul className="flex gap-1 whitespace-nowrap">
              {categories.map((c) => (
                <li key={c.id}>
                  <a href={`#cat-${c.slug}`} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold hover:bg-t-primary/5">
                    {l(c, 'name')}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={vegOnly} onChange={(e) => setVegOnly(e.target.checked)} className="h-4 w-4 accent-[#15803d]" />
            {t('site.vegOnly')}
          </label>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {hasDemo && <p className="mb-6 rounded-t border border-dashed border-t-line p-3 text-center text-sm text-t-muted">{t('site.sampleMenu')}</p>}
        {isLoading && <p className="text-center text-t-muted">{t('common.loading')}</p>}
        {!isLoading && categories.length === 0 && <p className="text-center text-t-muted">{vegOnly ? t('site.noVeg') : t('site.noMenu')}</p>}
        {categories.map((c) => (
          <section key={c.id} id={`cat-${c.slug}`} className="scroll-mt-32 pb-10" aria-labelledby={`h-${c.slug}`}>
            <h2 id={`h-${c.slug}`} className="text-center text-4xl text-t-primary">
              {l(c, 'name')}
            </h2>
            <LotusDivider className="mt-3" />
            <ul className="mt-4 divide-y divide-t-line">
              {c.items.map((i) => (
                <MenuRow key={i.id} item={i} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

/* ───────────────────────── About ───────────────────────── */

function Timeline({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const ref = useRef<HTMLElement>(null);
  const reduce = useReduceMotion();
  const desktop = useDesktopPointer();
  const milestones = site.content.milestones;
  const pinned = desktop && !reduce && milestones.length > 2;

  useGsap(
    ref,
    () => {
      const track = ref.current!.querySelector<HTMLElement>('[data-track]')!;
      const distance = () => track.scrollWidth - window.innerWidth + 64;
      gsap.to(track, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: { trigger: ref.current, start: 'top top', end: () => `+=${distance()}`, pin: true, scrub: 0.6, invalidateOnRefresh: true },
      });
      ScrollTrigger.refresh();
    },
    [milestones.length],
    pinned,
  );

  if (!milestones.length) return null;
  return (
    <section ref={ref} className="overflow-hidden bg-t-surface py-16" aria-labelledby="timeline-title">
      <div className="px-4 text-center">
        <h2 id="timeline-title" className="text-4xl text-t-primary sm:text-5xl">
          {t('site.milestonesTitle')}
        </h2>
        <LotusDivider className="mt-4" />
      </div>
      <ol data-track className={pinned ? 'mt-12 flex w-max gap-8 px-16' : 'mx-auto mt-10 max-w-2xl space-y-6 px-4'}>
        {milestones.map((m, i) => (
          <li key={i} className={`relative border-t-2 border-t-accent bg-t-bg p-6 ${pinned ? 'w-[380px] shrink-0' : ''}`}>
            <p className="font-display text-4xl text-t-primary">{m.year}</p>
            <h3 className="mt-2 font-body text-xl font-semibold">{l(m, 'title')}</h3>
            {l(m, 'text') && <p className="mt-2 text-t-muted">{l(m, 'text')}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function About({ site }: PageProps) {
  const { t } = useTranslation();
  const l = useLocalized();
  const about = l(site.content, 'about');
  return (
    <>
      <PageHeader title={t('site.nav.about')} eyebrow={site.name} />
      <section className="mx-auto grid max-w-5xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.2fr]">
        <CurtainReveal className="aspect-[4/5] w-full rounded-t-full">
          {site.theme.cover ? (
            <SiteImg image={site.theme.cover} alt={t('site.coverAlt', { name: site.name })} sizes="(min-width: 768px) 40vw, 90vw" className="h-full w-full" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[var(--t-x-goldSoft)]">
              <Diya className="h-1/2 w-1/2" />
            </div>
          )}
        </CurtainReveal>
        <div className="space-y-4 text-lg leading-relaxed">{about ? <Paragraphs text={about} /> : <p className="text-t-muted">{t('site.noStory', { name: site.name })}</p>}</div>
      </section>
      <Timeline site={site} />
    </>
  );
}

/* ───────────────────────── Gallery ───────────────────────── */

function Gallery({ site }: PageProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useSiteGallery();
  const { category, setCategory, available, visible } = useGalleryFilter(data);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <PageHeader title={t('site.nav.gallery')} eyebrow={site.name} />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {available.length > 1 && (
          <div className="mb-8 flex flex-wrap justify-center gap-2" role="group" aria-label={t('site.filterPhotos')}>
            {(['all', ...available] as const).map((c) => (
              <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${category === c ? 'bg-t-primary text-t-on-primary' : 'border border-t-line hover:border-t-primary'}`}>
                {c === 'all' ? t('site.allPhotos') : t(`site.galleryCat.${c}`)}
              </button>
            ))}
          </div>
        )}
        {isLoading && <p className="text-center text-t-muted">{t('common.loading')}</p>}
        {!isLoading && !visible.length && <p className="text-center text-t-muted">{t('site.noGallery')}</p>}
        <ul className="columns-2 gap-3 md:columns-3">
          {visible.map((g, i) => (
            <li key={g.id} className="mb-3 break-inside-avoid">
              <button type="button" onClick={() => setOpen(i)} className="block w-full text-left" aria-label={t('site.openPhoto', { alt: g.alt_text })}>
                <CurtainReveal>{g.image && <SiteImg image={g.image} alt="" sizes="(min-width: 768px) 30vw, 45vw" className="w-full" imgClassName="!h-auto" />}</CurtainReveal>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <Lightbox items={visible} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />
    </>
  );
}

/* ───────────────────────── Contact ───────────────────────── */

function Contact({ site }: PageProps) {
  const { t } = useTranslation();
  const status = useOpenStatus(site);
  const c = site.content.contact;
  return (
    <>
      <PageHeader title={t('site.nav.contact')} eyebrow={site.name} />
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2">
        <section aria-labelledby="reach-title">
          <h2 id="reach-title" className="text-3xl text-t-primary">
            {t('site.contactTitle')}
          </h2>
          <ContactList site={site} className="mt-5 space-y-3" itemClassName="flex min-h-14 items-center gap-3 rounded-t border border-t-line bg-t-surface p-4 hover:border-t-primary" iconClassName="h-5 w-5 text-t-primary" />
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={mapHref(site)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-t bg-t-primary px-5 font-semibold text-t-on-primary">
              <MapPin className="h-4 w-4" aria-hidden="true" /> {t('site.directions')}
            </a>
            {c.phone && (
              <a href={telHref(c.phone)} className="inline-flex min-h-12 items-center gap-2 rounded-t border border-t-primary px-5 font-semibold text-t-primary">
                <Phone className="h-4 w-4" aria-hidden="true" /> {t('site.call')}
              </a>
            )}
          </div>
        </section>
        <section aria-labelledby="hours-page-title" className="relative overflow-hidden rounded-t bg-t-primary p-6 text-[#FFF8E9]">
          <Jaali opacity={0.15} />
          <div className="relative">
            <div className="flex items-center gap-3">
              <Diya className="h-14 w-14" />
              <h2 id="hours-page-title" className="text-3xl">
                {t('site.hours')}
              </h2>
            </div>
            <div className="mt-3">
              <OpenBadge site={site} light />
            </div>
            <HoursTable site={site} status={status} className="mt-4" rowClassName="border-b border-white/15 py-2 text-[#F1E2BC]" todayClassName="!text-[#FFF8E9] font-semibold" />
          </div>
        </section>
      </div>
    </>
  );
}

export const pages = { home: Home, menu: MenuPage, about: About, gallery: Gallery, contact: Contact };
