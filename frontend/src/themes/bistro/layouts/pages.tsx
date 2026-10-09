import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight } from 'lucide-react';
import { useReduceMotion } from '@/stores/motion';
import { useDesktopPointer } from '@/site/motion';
import { featuredItems, formatPrice, mapHref, telHref, useLocalized, useOpenStatus, useSiteGallery, useSiteMenu } from '@/site/data';
import { FoodTypeMark, SiteImg, SpiceLevel, useOpenLabel } from '@/site/components/bits';
import { artFor, FoodArt } from '@/site/components/FoodArt';
import { ContactList, HoursTable, Lightbox, MenuSearch, Paragraphs, useGalleryFilter, useHomeSections, useMenuFilter } from '@/site/components/shared';
import { AddButton } from '@/site/order/AddToCart';
import type { MenuItem, SiteData } from '@/site/types';
import type { PageProps } from '../../types';
import { Odometer, useCursorPreview, useLineReveal, VelocityMarquee } from './effects';

const artStyle = { '--art-ink': '#1E1D1B', '--art-a': '#E9DCC6', '--art-b': '#B5532D' } as React.CSSProperties;

function Label({ children, n }: { children: React.ReactNode; n?: string }) {
  return (
    <p className="mono flex items-center gap-3 text-xs uppercase text-t-muted">
      {n && <span>{n}</span>}
      <span className="h-px w-8 bg-[var(--t-x-stone)]" aria-hidden="true" />
      {children}
    </p>
  );
}

function OpenStatusLine({ site }: { site: SiteData }) {
  const status = useOpenLabel(useOpenStatus(site));
  if (!status) return null;
  return (
    <p className="mono inline-flex items-center gap-2 text-xs uppercase" aria-live="polite">
      <span className={`h-2 w-2 ${status.open ? 'bg-t-accent' : 'bg-t-primary'}`} aria-hidden="true" />
      {status.label}
      {status.detail && <span className="text-t-muted">/ {status.detail}</span>}
    </p>
  );
}

function DishVisual({ item, className = '', sizes = '30vw' }: { item: MenuItem; className?: string; sizes?: string }) {
  const l = useLocalized();
  if (item.image) return <SiteImg image={item.image} alt={l(item, 'name') ?? item.name} sizes={sizes} className={className} />;
  return (
    <span className={`flex items-center justify-center bg-[#EFE8DC] ${className}`} style={artStyle}>
      <FoodArt art={artFor(item.name)} className="h-1/2 w-1/2" />
    </span>
  );
}

function PageHead({ n, title, site }: { n: string; title: string; site: SiteData }) {
  const ref = useRef<HTMLElement>(null);
  useLineReveal(ref, [title]);
  return (
    <section ref={ref} className="mx-auto max-w-7xl border-b border-t-line px-4 pb-8 pt-12 sm:px-8 sm:pt-16">
      <Label n={n}>{site.name}</Label>
      <h1 data-lines className="mt-4 text-6xl leading-[0.95] sm:text-8xl">
        {title}
      </h1>
    </section>
  );
}

/* ───────────────────────── Home ───────────────────────── */

function Hero({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const l = useLocalized();
  return (
    <section className="mx-auto grid max-w-7xl border-b border-t-line md:grid-cols-12" aria-labelledby="hero-title">
      <div className="flex flex-col justify-between gap-10 px-4 py-10 sm:px-8 md:col-span-5 md:border-r md:border-t-line md:py-14">
        <div>
          <Label n="01">
            {t(`types.${site.business_type}`)}
            {site.city && ` — ${site.city}`}
          </Label>
          <h1 id="hero-title" data-lines className="mt-6 text-6xl leading-[0.92] sm:text-7xl lg:text-8xl">
            {site.name}
          </h1>
          {l(site.content, 'tagline') && (
            <p data-lines className="mt-6 max-w-sm text-lg text-t-muted">
              {l(site.content, 'tagline')}
            </p>
          )}
        </div>
        <div className="space-y-6">
          <OpenStatusLine site={site} />
          <div className="flex flex-wrap gap-3">
            {site.has_menu && (
              <Link to="/menu" className="inline-flex min-h-12 items-center gap-2 bg-t-primary px-6 font-medium text-t-on-primary transition-colors hover:bg-t-text">
                {t('site.viewMenu')} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
            <a href={mapHref(site)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 border border-t-line px-6 font-medium hover:bg-t-text hover:text-t-bg">
              {t('site.directions')}
            </a>
          </div>
        </div>
      </div>
      <div className="md:col-span-7">
        <div data-wipe className="relative aspect-square overflow-hidden md:aspect-auto md:h-full md:min-h-[560px]">
          <div data-parallax className="absolute inset-[-8%_0]">
            {site.theme.cover ? (
              <SiteImg image={site.theme.cover} alt={t('site.coverAlt', { name: site.name })} sizes="(min-width: 768px) 58vw, 100vw" className="h-full w-full" priority />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#EFE8DC]" style={artStyle}>
                <FoodArt art={site.business_type === 'cafe' ? 'coffee' : 'thali'} className="h-1/2 w-1/2" />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Specials() {
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  const { data: menu } = useSiteMenu();
  const items = featuredItems(menu, 6);
  if (!items.length) return null;
  return (
    <section aria-labelledby="specials-title" className="py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <Label n="02">{t('site.fromKitchen')}</Label>
        <h2 id="specials-title" data-lines className="mt-4 text-5xl sm:text-6xl">
          {t('site.specialsTitle')}
        </h2>
      </div>
      <div className="mt-8">
        <VelocityMarquee items={items.map((i) => l(i, 'name') ?? i.name)} label={t('site.specialsTitle')} />
      </div>
      <ul className="mx-auto mt-10 grid max-w-7xl border-y border-t-line sm:grid-cols-2 lg:grid-cols-3">
        {items.slice(0, 3).map((item) => (
          <li key={item.id} className="border-t-line p-4 sm:p-6 [&+&]:border-t sm:[&+&]:border-l sm:[&+&]:border-t-0">
            <div className="relative aspect-square overflow-hidden">
              <div data-parallax className="absolute inset-[-8%_0]">
                <DishVisual item={item} className="h-full w-full" sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between gap-3">
              <h3 className="serif flex items-center gap-2 text-2xl">
                <FoodTypeMark type={item.food_type} /> {l(item, 'name')}
              </h3>
              <span className="mono text-sm">{formatPrice(item.price, i18n.language)}</span>
            </div>
            {item.is_demo && <p className="mono mt-1 text-xs uppercase text-t-muted">{t('common.demo')}</p>}
            <div className="mt-3">
              <AddButton item={item} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Story({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const about = l(site.content, 'about');
  return (
    <section className="mx-auto grid max-w-7xl gap-10 border-y border-t-line px-4 py-14 sm:px-8 md:grid-cols-12" aria-labelledby="story-title">
      <div className="md:col-span-4">
        <Label n="03">{t('site.ourStory')}</Label>
      </div>
      <div className="md:col-span-8">
        <h2 id="story-title" data-lines className="text-4xl leading-tight sm:text-5xl">
          {l(site.content, 'tagline') ?? site.name}
        </h2>
        <div className="mt-6 max-w-2xl space-y-4 text-lg text-t-muted">{about ? <Paragraphs text={about.split(/\n{2,}/)[0]} /> : <p>{t('site.noStory', { name: site.name })}</p>}</div>
        <Link to="/about" className="mono mt-6 inline-flex min-h-11 items-center gap-2 text-xs uppercase underline underline-offset-4 hover:text-[var(--t-x-primaryInk)]">
          {t('site.readStory')} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function MenuPreview() {
  const { t } = useTranslation();
  const l = useLocalized();
  const { data: menu } = useSiteMenu();
  if (!menu?.length) return null;
  const items = menu.flatMap((c) => c.items);
  const stats = [
    { label: t('site.dishesCount'), value: items.length },
    { label: t('site.categoriesCount'), value: menu.length },
    { label: t('site.vegCount'), value: items.filter((i) => i.food_type === 'veg').length },
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-8" aria-labelledby="menu-preview-title">
      <Label n="04">{t('site.nav.menu')}</Label>
      <h2 id="menu-preview-title" data-lines className="mt-4 text-5xl sm:text-6xl">
        {t('site.menuPreviewTitle')}
      </h2>
      <dl className="mt-10 grid grid-cols-3 border-y border-t-line">
        {stats.map((s, i) => (
          <div key={s.label} className={`py-6 ${i ? 'border-l border-t-line pl-4 sm:pl-8' : ''}`}>
            <dt className="mono text-xs uppercase text-t-muted">{s.label}</dt>
            <dd className="mt-2 font-display text-5xl sm:text-7xl">
              <Odometer value={s.value} />
            </dd>
          </div>
        ))}
      </dl>
      <ul className="mt-8 grid gap-x-10 sm:grid-cols-2">
        {menu.map((c, i) => (
          <li key={c.id} className="border-b border-t-line">
            <Link to={`/menu#cat-${c.slug}`} className="flex min-h-14 items-baseline justify-between gap-4 py-3 hover:text-[var(--t-x-primaryInk)]">
              <span className="font-display text-2xl">
                <span className="mono mr-3 text-xs text-t-muted">{String(i + 1).padStart(2, '0')}</span>
                {l(c, 'name')}
              </span>
              <span className="mono text-xs text-t-muted">{c.items.length}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GalleryStrip() {
  const { t } = useTranslation();
  const { data } = useSiteGallery();
  const items = (data ?? []).slice(0, 5);
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-8" aria-labelledby="gallery-title">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Label n="05">{t('site.nav.gallery')}</Label>
          <h2 id="gallery-title" data-lines className="mt-4 text-5xl sm:text-6xl">
            {t('site.galleryTitle')}
          </h2>
        </div>
        <Link to="/gallery" className="mono hidden min-h-11 items-center gap-2 text-xs uppercase underline underline-offset-4 sm:inline-flex">
          {t('site.seeGallery')} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map((g, i) => (
          <li key={g.id} className={i === 0 ? 'col-span-2 row-span-2' : ''}>
            <div data-wipe className="relative aspect-square overflow-hidden">
              {g.image && <SiteImg image={g.image} alt={g.alt_text} sizes={i === 0 ? '50vw' : '25vw'} className="h-full w-full" />}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Hours({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const status = useOpenStatus(site);
  return (
    <section className="mx-auto grid max-w-7xl gap-8 border-t border-t-line px-4 py-14 sm:px-8 md:grid-cols-12" aria-labelledby="hours-title">
      <div className="md:col-span-4">
        <Label n="06">{t('site.hours')}</Label>
        <h2 id="hours-title" data-lines className="mt-4 text-5xl">
          {t('site.whenOpen')}
        </h2>
        <div className="mt-4">
          <OpenStatusLine site={site} />
        </div>
      </div>
      <HoursTable site={site} status={status} className="mono text-sm md:col-span-8" rowClassName="border-b border-t-line py-3 uppercase" todayClassName="text-[var(--t-x-primaryInk)]" />
    </section>
  );
}

function Visit({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  return (
    <section className="mx-auto grid max-w-7xl gap-8 border-t border-t-line px-4 py-14 sm:px-8 md:grid-cols-12" aria-labelledby="visit-title">
      <div className="md:col-span-4">
        <Label n="07">{t('site.findUs')}</Label>
        <h2 id="visit-title" data-lines className="mt-4 text-5xl">
          {t('site.visitTitle')}
        </h2>
      </div>
      <ContactList site={site} className="grid content-start border-t border-t-line sm:grid-cols-2 sm:gap-x-8 md:col-span-8" itemClassName="flex min-h-16 items-center gap-3 border-b border-t-line p-4 hover:bg-t-surface" iconClassName="h-5 w-5 text-[var(--t-x-primaryInk)]" />
    </section>
  );
}

function Home({ site }: PageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const sections = useHomeSections(site);
  const { data: menu } = useSiteMenu();
  const { data: gallery } = useSiteGallery(site.has_gallery);
  useLineReveal(ref, [sections.join(), !!menu, !!gallery]);
  const render = {
    specials: <Specials />,
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

function MenuRow({ item, preview }: { item: MenuItem; preview: ReturnType<typeof useCursorPreview> }) {
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  const [open, setOpen] = useState(false);
  const id = `dish-${item.id}`;
  return (
    <li className="border-b border-t-line">
      <div className="flex items-center gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        onPointerEnter={(e) => e.pointerType === 'mouse' && preview.show(<DishVisual item={item} className="h-full w-full" sizes="224px" />)}
        onPointerLeave={() => preview.hide()}
        className={`grid min-w-0 flex-1 grid-cols-[auto_1fr_auto] items-baseline gap-x-3 py-4 text-left hover:text-[var(--t-x-primaryInk)] ${item.is_available ? '' : 'opacity-60'}`}
      >
        <FoodTypeMark type={item.food_type} className="translate-y-0.5" />
        <span className="min-w-0">
          <span className="serif block font-display text-2xl leading-tight">{l(item, 'name')}</span>
          <span className="mono mt-1 flex flex-wrap gap-x-3 text-[11px] uppercase text-t-muted">
            {item.is_chefs_special && <span>{t('site.chefsSpecial')}</span>}
            {item.is_bestseller && <span>{t('site.bestseller')}</span>}
            {!item.is_available && <span>{t('site.unavailable')}</span>}
            {item.is_demo && <span>{t('common.demo')}</span>}
            <SpiceLevel level={item.spice_level} />
          </span>
        </span>
        <span className="mono text-sm">{formatPrice(item.price, i18n.language)}</span>
      </button>
        <AddButton item={item} className="shrink-0" />
      </div>
      {open && (
        <div id={id} className="grid gap-4 pb-5 sm:grid-cols-[160px_1fr]">
          <DishVisual item={item} className="aspect-square w-full max-w-[220px]" sizes="220px" />
          <p className="text-t-muted">{l(item, 'description') ?? t('site.noDescription')}</p>
        </div>
      )}
    </li>
  );
}

function MenuPage({ site }: PageProps) {
  const { t } = useTranslation();
  const l = useLocalized();
  const reduce = useReduceMotion();
  const desktop = useDesktopPointer();
  const preview = useCursorPreview(desktop && !reduce);
  const { data: menu, isLoading } = useSiteMenu();
  const { categories, vegOnly, setVegOnly, search, setSearch, hasDemo } = useMenuFilter(menu);
  return (
    <>
      <PageHead n="—" title={t('site.nav.menu')} site={site} />
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-8 md:grid-cols-12">
        <aside className="md:col-span-3">
          <div className="md:sticky md:top-24">
            <MenuSearch value={search} onChange={setSearch} className="mb-3 block min-h-11 w-full border border-t-line bg-white px-3 text-sm" />
            <label className="mono flex min-h-11 cursor-pointer items-center gap-2 text-xs uppercase">
              <input type="checkbox" checked={vegOnly} onChange={(e) => setVegOnly(e.target.checked)} className="h-4 w-4 accent-[#15803d]" />
              {t('site.vegOnly')}
            </label>
            <nav aria-label={t('site.categories')} className="mt-4 hidden md:block">
              <ol className="mono space-y-1 text-xs uppercase">
                {categories.map((c, i) => (
                  <li key={c.id}>
                    <a href={`#cat-${c.slug}`} className="inline-flex min-h-9 items-center gap-3 hover:text-[var(--t-x-primaryInk)]">
                      <span className="text-t-muted">{String(i + 1).padStart(2, '0')}</span>
                      {l(c, 'name')}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <p className="mono mt-6 hidden text-[11px] uppercase text-t-muted md:block">{desktop && !reduce ? t('site.hoverPreview') : t('site.tapToExpand')}</p>
          </div>
        </aside>
        <div className="md:col-span-9">
          {hasDemo && <p className="mono mb-6 border border-dashed border-t-line p-3 text-xs uppercase text-t-muted">{t('site.sampleMenu')}</p>}
          {isLoading && <p className="text-t-muted">{t('common.loading')}</p>}
          {!isLoading && categories.length === 0 && <p className="text-t-muted">{search ? t('site.noResults', { q: search }) : vegOnly ? t('site.noVeg') : t('site.noMenu')}</p>}
          {categories.map((c, i) => (
            <section key={c.id} id={`cat-${c.slug}`} className="scroll-mt-20 pb-12" aria-labelledby={`h-${c.slug}`}>
              <h2 id={`h-${c.slug}`} className="flex items-baseline gap-4 border-b border-t-line pb-3 text-4xl">
                <span className="mono text-xs text-t-muted">{String(i + 1).padStart(2, '0')}</span>
                {l(c, 'name')}
              </h2>
              <ul>
                {c.items.map((item) => (
                  <MenuRow key={item.id} item={item} preview={preview} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
      {preview.node}
    </>
  );
}

/* ───────────────────────── About ───────────────────────── */

function About({ site }: PageProps) {
  const { t } = useTranslation();
  const l = useLocalized();
  const ref = useRef<HTMLDivElement>(null);
  const about = l(site.content, 'about');
  useLineReveal(ref, [about]);
  return (
    <div ref={ref}>
      <PageHead n="—" title={t('site.nav.about')} site={site} />
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-8 md:grid-cols-12">
        <div className="md:col-span-5">
          <div data-wipe className="relative aspect-square overflow-hidden">
            <div data-parallax className="absolute inset-[-8%_0]">
              {site.theme.cover ? (
                <SiteImg image={site.theme.cover} alt={t('site.coverAlt', { name: site.name })} sizes="(min-width: 768px) 40vw, 100vw" className="h-full w-full" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#EFE8DC]" style={artStyle}>
                  <FoodArt art="coffee" className="h-1/2 w-1/2" />
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="md:col-span-7">
          {l(site.content, 'tagline') && (
            <p data-lines className="font-display text-4xl leading-tight">
              “{l(site.content, 'tagline')}”
            </p>
          )}
          <div className="mt-8 space-y-4 text-lg leading-relaxed text-t-muted md:columns-2 md:gap-8 [&>p]:break-inside-avoid">
            {about ? <Paragraphs text={about} /> : <p>{t('site.noStory', { name: site.name })}</p>}
          </div>
        </div>
      </section>
      {site.content.milestones.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-8" aria-labelledby="milestones-title">
          <Label n="—">{t('site.milestonesTitle')}</Label>
          <h2 id="milestones-title" className="sr-only">
            {t('site.milestonesTitle')}
          </h2>
          <ol className="mt-6 border-t border-t-line">
            {site.content.milestones.map((m, i) => (
              <li key={i} className="grid gap-2 border-b border-t-line py-6 sm:grid-cols-12">
                <p className="mono text-sm sm:col-span-2">{m.year}</p>
                <h3 className="serif font-display text-3xl sm:col-span-4">{l(m, 'title')}</h3>
                {l(m, 'text') && <p className="text-t-muted sm:col-span-6">{l(m, 'text')}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/* ───────────────────────── Gallery ───────────────────────── */

function Gallery({ site }: PageProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useSiteGallery();
  const { category, setCategory, available, visible } = useGalleryFilter(data);
  const [open, setOpen] = useState<number | null>(null);
  useLineReveal(ref, [visible.length]);
  return (
    <div ref={ref}>
      <PageHead n="—" title={t('site.nav.gallery')} site={site} />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
        {available.length > 1 && (
          <div className="mono mb-8 flex flex-wrap gap-x-6 text-xs uppercase" role="group" aria-label={t('site.filterPhotos')}>
            {(['all', ...available] as const).map((c) => (
              <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={`min-h-11 ${category === c ? 'text-[var(--t-x-primaryInk)] underline underline-offset-4' : 'hover:text-[var(--t-x-primaryInk)]'}`}>
                {c === 'all' ? t('site.allPhotos') : t(`site.galleryCat.${c}`)}
              </button>
            ))}
          </div>
        )}
        {isLoading && <p className="text-t-muted">{t('common.loading')}</p>}
        {!isLoading && !visible.length && <p className="text-t-muted">{t('site.noGallery')}</p>}
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {visible.map((g, i) => (
            <li key={g.id} className={i % 5 === 0 ? 'col-span-2 row-span-2' : ''}>
              <button type="button" onClick={() => setOpen(i)} className="block w-full" aria-label={t('site.openPhoto', { alt: g.alt_text })}>
                <div data-wipe className="relative aspect-square overflow-hidden">
                  {g.image && <SiteImg image={g.image} alt="" sizes={i % 5 === 0 ? '50vw' : '25vw'} className="h-full w-full transition-transform duration-700 hover:scale-105" />}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <Lightbox items={visible} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />
    </div>
  );
}

/* ───────────────────────── Contact ───────────────────────── */

function Contact({ site }: PageProps) {
  const { t } = useTranslation();
  const status = useOpenStatus(site);
  const c = site.content.contact;
  return (
    <>
      <PageHead n="—" title={t('site.nav.contact')} site={site} />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-8 md:grid-cols-12">
        <section className="md:col-span-7" aria-labelledby="reach-title">
          <h2 id="reach-title" className="text-4xl">
            {t('site.contactTitle')}
          </h2>
          <ContactList site={site} className="mt-6 border-t border-t-line" itemClassName="flex min-h-16 items-center gap-3 border-b border-t-line p-4 hover:bg-t-surface" iconClassName="h-5 w-5 text-[var(--t-x-primaryInk)]" />
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={mapHref(site)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 bg-t-primary px-6 font-medium text-t-on-primary hover:bg-t-text">
              {t('site.directions')} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
            {c.phone && (
              <a href={telHref(c.phone)} className="inline-flex min-h-12 items-center gap-2 border border-t-line px-6 font-medium hover:bg-t-text hover:text-t-bg">
                {t('site.call')}
              </a>
            )}
          </div>
        </section>
        <section className="md:col-span-5" aria-labelledby="hours-page-title">
          <h2 id="hours-page-title" className="text-4xl">
            {t('site.hours')}
          </h2>
          <div className="mt-3">
            <OpenStatusLine site={site} />
          </div>
          <HoursTable site={site} status={status} className="mono mt-4 text-sm" rowClassName="border-b border-t-line py-3 uppercase" todayClassName="text-[var(--t-x-primaryInk)]" />
        </section>
      </div>
    </>
  );
}

export const pages = { home: Home, menu: MenuPage, about: About, gallery: Gallery, contact: Contact };

