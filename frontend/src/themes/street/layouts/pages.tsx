import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { ArrowRight, MapPin, Phone } from 'lucide-react';
import { featuredItems, formatPrice, mapHref, telHref, useLocalized, useOpenStatus, useSiteGallery, useSiteMenu } from '@/site/data';
import { FoodTypeMark, SiteImg, SpiceLevel, useOpenLabel } from '@/site/components/bits';
import { artFor, FoodArt, type ArtKey } from '@/site/components/FoodArt';
import { ContactList, HoursTable, Lightbox, Paragraphs, useGalleryFilter, useHomeSections, useMenuFilter } from '@/site/components/shared';
import type { MenuItem, SiteData } from '@/site/types';
import type { PageProps } from '../../types';
import { SPRING } from '../motion';
import { AngledMarquee, DroppingSticker, PopLetters, SquashA, SquashButton, SquashLink } from './effects';

const TILTS = ['-rotate-2', 'rotate-1', '-rotate-1', 'rotate-2'];
const artVars = { '--art-ink': '#141414', '--art-a': '#FFCB2E', '--art-b': '#D7261E' } as React.CSSProperties;
const btnPrimary = 'street-box inline-flex min-h-12 items-center gap-2 bg-t-primary px-5 font-bold uppercase text-t-on-primary';
const btnPlain = 'street-box inline-flex min-h-12 items-center gap-2 bg-t-surface px-5 font-bold uppercase text-t-text';

function OpenSticker({ site }: { site: SiteData }) {
  const status = useOpenLabel(useOpenStatus(site));
  if (!status) return null;
  return (
    <p className={`street-box-sm inline-flex rotate-1 items-center gap-2 px-3 py-1.5 text-sm font-bold uppercase ${status.open ? 'bg-[#7ED9B5] text-[#141414]' : 'bg-[#141414] text-[#FFCB2E]'}`} aria-live="polite">
      <span className={`h-2.5 w-2.5 rounded-full border-2 border-current ${status.open ? 'bg-[#141414]' : ''}`} aria-hidden="true" />
      {status.label}
      {status.detail && <span className="font-normal normal-case">· {status.detail}</span>}
    </p>
  );
}

function DishVisual({ item, className = '' }: { item: MenuItem; className?: string }) {
  const l = useLocalized();
  if (item.image) return <SiteImg image={item.image} alt={l(item, 'name') ?? item.name} sizes="(min-width: 768px) 30vw, 90vw" className={className} />;
  return (
    <span className={`flex items-center justify-center bg-[#FFF1C7] ${className}`} style={artVars}>
      <FoodArt art={artFor(item.name)} className="h-3/5 w-3/5" />
    </span>
  );
}

function SectionHead({ title, id, tone = 'mustard' }: { title: string; id: string; tone?: 'mustard' | 'mint' | 'chilli' }) {
  const bg = { mustard: 'bg-[#FFCB2E] text-[#141414]', mint: 'bg-[#7ED9B5] text-[#141414]', chilli: 'bg-[#D7261E] text-white' }[tone];
  return (
    <h2 id={id} className={`street-box inline-block -rotate-1 px-4 py-2 text-4xl sm:text-5xl ${bg}`}>
      {title}
    </h2>
  );
}

function DishCard({ item, i }: { item: MenuItem; i: number }) {
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  return (
    <motion.li
      className={`street-box relative flex flex-col overflow-hidden bg-t-surface ${TILTS[i % TILTS.length]} ${item.is_available ? '' : 'opacity-70'}`}
      whileHover={{ rotate: 0, y: -4 }}
      transition={SPRING}
    >
      <DishVisual item={item} className="aspect-[4/3] w-full border-b-[2.5px] border-[#141414]" />
      <span className="street-box-sm absolute right-3 top-3 rotate-6 bg-t-accent px-2.5 py-1 font-display text-lg text-t-on-accent">{formatPrice(item.price, i18n.language)}</span>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="display flex items-start gap-2 text-xl">
          <FoodTypeMark type={item.food_type} className="mt-0.5" />
          <span>{l(item, 'name')}</span>
        </h3>
        {l(item, 'description') && <p className="mt-2 text-sm">{l(item, 'description')}</p>}
        <p className="mt-auto flex flex-wrap items-center gap-1.5 pt-3 text-xs font-bold uppercase">
          {item.is_chefs_special && <span className="rounded-md border-2 border-[#141414] bg-[#7ED9B5] px-1.5 py-0.5">{t('site.chefsSpecial')}</span>}
          {item.is_bestseller && <span className="rounded-md border-2 border-[#141414] bg-[#FFCB2E] px-1.5 py-0.5">{t('site.bestseller')}</span>}
          {!item.is_available && <span className="rounded-md border-2 border-[#141414] bg-[#141414] px-1.5 py-0.5 text-white">{t('site.unavailable')}</span>}
          {item.is_demo && <span className="rounded-md border-2 border-dashed border-[#141414] px-1.5 py-0.5">{t('common.demo')}</span>}
          <SpiceLevel level={item.spice_level} />
        </p>
      </div>
    </motion.li>
  );
}

function PageBand({ title, tone = 'mustard' }: { title: string; tone?: 'mustard' | 'mint' | 'chilli' }) {
  const bg = { mustard: 'bg-[#FFCB2E] text-[#141414]', mint: 'bg-[#7ED9B5] text-[#141414]', chilli: 'bg-[#D7261E] text-white' }[tone];
  return (
    <section className={`border-b-[2.5px] border-t-line px-4 py-12 text-center sm:py-16 ${bg}`}>
      <h1 className="text-6xl sm:text-8xl">
        <PopLetters text={title} />
      </h1>
    </section>
  );
}

/* ───────────────────────── Home ───────────────────────── */

const STICKERS: { art: ArtKey; className: string; rotate: number; color: string }[] = [
  { art: 'chaat', className: 'left-[2%] top-[8%] sm:left-[4%]', rotate: -10, color: '#7ED9B5' },
  { art: 'pav', className: 'right-[3%] top-[6%] sm:right-[8%]', rotate: 9, color: '#FFF9EC' },
  { art: 'drink', className: 'bottom-[6%] left-[6%] hidden sm:block', rotate: 6, color: '#FFF9EC' },
  { art: 'roll', className: 'bottom-[8%] right-[4%]', rotate: -7, color: '#7ED9B5' },
];

function Hero({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const l = useLocalized();
  return (
    <section className="relative overflow-hidden border-b-[2.5px] border-t-line bg-[#FFCB2E] text-[#141414]" aria-labelledby="hero-title">
      {STICKERS.map((s, i) => (
        <DroppingSticker key={s.art} art={s.art} className={s.className} rotate={s.rotate} color={s.color} delay={0.35 + i * 0.12} />
      ))}
      <div className="relative mx-auto flex max-w-5xl flex-col items-center px-4 pb-20 pt-28 text-center sm:pb-28 sm:pt-32">
        <p className="street-box-sm -rotate-2 bg-[#141414] px-3 py-1 text-sm font-bold uppercase text-[#FFCB2E]">
          {t(`types.${site.business_type}`)}
          {site.city && ` · ${site.city}`}
        </p>
        <h1 id="hero-title" className="mt-6 text-6xl sm:text-8xl lg:text-9xl">
          <PopLetters text={site.name} delay={0.1} />
        </h1>
        {l(site.content, 'tagline') && <p className="mt-5 max-w-xl text-lg font-bold">{l(site.content, 'tagline')}</p>}
        <div className="mt-6">
          <OpenSticker site={site} />
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {site.has_menu && (
            <SquashLink to="/menu" className={btnPrimary} whileTap={{ scaleX: 1.12, scaleY: 0.88 }} whileHover={{ y: -2 }} transition={SPRING}>
              {t('site.viewMenu')} <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </SquashLink>
          )}
          <SquashA href={mapHref(site)} target="_blank" rel="noopener noreferrer" className={btnPlain}>
            <MapPin className="h-5 w-5" aria-hidden="true" /> {t('site.directions')}
          </SquashA>
        </div>
        {site.theme.cover && (
          <div className="street-box mt-12 w-full max-w-2xl rotate-1 overflow-hidden bg-t-surface">
            <SiteImg image={site.theme.cover} alt={t('site.coverAlt', { name: site.name })} sizes="(min-width: 768px) 672px, 92vw" className="aspect-[16/9] w-full" priority />
          </div>
        )}
      </div>
    </section>
  );
}

function Specials() {
  const { t } = useTranslation();
  const { data: menu } = useSiteMenu();
  const items = featuredItems(menu, 6);
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="specials-title">
      <SectionHead id="specials-title" title={t('site.specialsTitle')} tone="chilli" />
      <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <DishCard key={item.id} item={item} i={i} />
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
    <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="story-title">
      <div className="street-box grid gap-6 bg-[#7ED9B5] p-6 text-[#141414] sm:p-10 md:grid-cols-[1fr_auto]">
        <div>
          <h2 id="story-title" className="text-4xl sm:text-5xl">
            {t('site.ourStory')}
          </h2>
          <div className="mt-4 space-y-3 text-lg">{about ? <Paragraphs text={about.split(/\n{2,}/)[0]} /> : <p>{t('site.noStory', { name: site.name })}</p>}</div>
          <SquashLink to="/about" className={`${btnPlain} mt-6`} whileTap={{ scaleX: 1.12, scaleY: 0.88 }} transition={SPRING}>
            {t('site.readStory')} <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </SquashLink>
        </div>
        <div className="hidden items-center justify-center md:flex" style={artVars}>
          <FoodArt art="thali" className="street-sticker-art h-40 w-40 rotate-6" />
        </div>
      </div>
    </section>
  );
}

function MenuPreview() {
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  const { data: menu } = useSiteMenu();
  const [active, setActive] = useState(0);
  if (!menu?.length) return null;
  const cat = menu[Math.min(active, menu.length - 1)];
  return (
    <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="menu-preview-title">
      <SectionHead id="menu-preview-title" title={t('site.menuPreviewTitle')} />
      <div className="mt-8 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label={t('site.categories')}>
        {menu.map((c, i) => (
          <SquashButton key={c.id} role="tab" aria-selected={i === active} onClick={() => setActive(i)} className={`street-box-sm min-h-11 shrink-0 px-4 font-bold uppercase ${i === active ? 'bg-t-text text-t-bg' : 'bg-t-surface'}`}>
            {l(c, 'name')}
          </SquashButton>
        ))}
      </div>
      <div role="tabpanel" aria-label={l(cat, 'name') ?? cat.name}>
      <ul className="street-box mt-6 divide-y-[2.5px] divide-[#141414] bg-t-surface">
        {cat.items.slice(0, 5).map((item) => (
          <li key={item.id} className="flex items-center gap-3 p-4">
            <FoodTypeMark type={item.food_type} />
            <span className="flex-1 font-bold">{l(item, 'name')}</span>
            <span className="font-display text-lg">{formatPrice(item.price, i18n.language)}</span>
          </li>
        ))}
      </ul>
      </div>
      <SquashLink to="/menu" className={`${btnPrimary} mt-6`} whileTap={{ scaleX: 1.12, scaleY: 0.88 }} transition={SPRING}>
        {t('site.fullMenu')} <ArrowRight className="h-5 w-5" aria-hidden="true" />
      </SquashLink>
    </section>
  );
}

function GalleryStrip() {
  const { t } = useTranslation();
  const { data } = useSiteGallery();
  const items = (data ?? []).slice(0, 4);
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="gallery-title">
      <SectionHead id="gallery-title" title={t('site.galleryTitle')} tone="mint" />
      <ul className="mt-10 grid grid-cols-2 gap-6 md:grid-cols-4">
        {items.map((g, i) => (
          <li key={g.id} className={`street-box overflow-hidden bg-t-surface p-2 ${TILTS[i % TILTS.length]}`}>
            {g.image && <SiteImg image={g.image} alt={g.alt_text} sizes="(min-width: 768px) 25vw, 45vw" className="aspect-square w-full rounded-md" />}
          </li>
        ))}
      </ul>
      <SquashLink to="/gallery" className={`${btnPlain} mt-8`} whileTap={{ scaleX: 1.12, scaleY: 0.88 }} transition={SPRING}>
        {t('site.seeGallery')} <ArrowRight className="h-5 w-5" aria-hidden="true" />
      </SquashLink>
    </section>
  );
}

function Hours({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const status = useOpenStatus(site);
  return (
    <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="hours-title">
      <div className="street-box mx-auto max-w-xl -rotate-1 bg-t-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="hours-title" className="text-4xl">
            {t('site.hours')}
          </h2>
          <OpenSticker site={site} />
        </div>
        <HoursTable site={site} status={status} className="mt-5 text-sm" rowClassName="border-b-2 border-dashed border-[#141414]/30 py-2 uppercase" todayClassName="bg-[#FFCB2E] px-2 font-bold" />
      </div>
    </section>
  );
}

function Visit({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="visit-title">
      <SectionHead id="visit-title" title={t('site.visitTitle')} />
      <ContactList site={site} className="mt-8 grid gap-4 sm:grid-cols-2" itemClassName="street-box-sm flex min-h-14 items-center gap-3 bg-t-surface p-4 font-bold hover:bg-[#FFCB2E]" iconClassName="h-6 w-6" />
    </section>
  );
}

function Home({ site }: PageProps) {
  const l = useLocalized();
  const sections = useHomeSections(site);
  const { data: menu } = useSiteMenu();
  const words = (menu ?? []).map((c) => l(c, 'name') ?? c.name);
  const render = {
    specials: <Specials />,
    story: <Story site={site} />,
    menu_preview: <MenuPreview />,
    gallery: <GalleryStrip />,
    hours: <Hours site={site} />,
    visit: <Visit site={site} />,
  };
  return (
    <>
      <Hero site={site} />
      <AngledMarquee words={words.length ? words : [site.name]} tone="chilli" />
      {sections.map((key, i) => (
        <div key={key}>
          {render[key]}
          {i === 1 && words.length > 0 && <AngledMarquee words={[site.name, ...words]} tone="ink" reverse angle={2} />}
        </div>
      ))}
    </>
  );
}

/* ───────────────────────── Menu ───────────────────────── */

function MenuPage(_: PageProps) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { data: menu, isLoading } = useSiteMenu();
  const { categories, vegOnly, setVegOnly, hasDemo } = useMenuFilter(menu);
  return (
    <>
      <PageBand title={t('site.nav.menu')} />
      <div className="sticky top-[66px] z-30 border-b-[2.5px] border-t-line bg-t-bg">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <nav aria-label={t('site.categories')} className="min-w-0 flex-1 overflow-x-auto">
            <ul className="flex gap-2 py-1">
              {categories.map((c) => (
                <li key={c.id}>
                  <a href={`#cat-${c.slug}`} className="street-box-sm inline-flex min-h-11 items-center whitespace-nowrap bg-t-surface px-3 text-sm font-bold uppercase hover:bg-[#FFCB2E]">
                    {l(c, 'name')}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <label className="street-box-sm flex min-h-11 shrink-0 cursor-pointer items-center gap-2 bg-[#7ED9B5] px-3 text-sm font-bold uppercase">
            <input type="checkbox" checked={vegOnly} onChange={(e) => setVegOnly(e.target.checked)} className="h-4 w-4 accent-[#15803d]" />
            {t('site.vegOnly')}
          </label>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-10">
        {hasDemo && <p className="street-box-sm mb-8 bg-t-surface p-3 text-center text-sm font-bold">{t('site.sampleMenu')}</p>}
        {isLoading && <p>{t('common.loading')}</p>}
        {!isLoading && categories.length === 0 && <p className="text-center font-bold">{vegOnly ? t('site.noVeg') : t('site.noMenu')}</p>}
        {categories.map((c) => (
          <section key={c.id} id={`cat-${c.slug}`} className="scroll-mt-36 pb-14" aria-labelledby={`h-${c.slug}`}>
            <SectionHead id={`h-${c.slug}`} title={l(c, 'name') ?? c.name} tone="mustard" />
            <ul className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {c.items.map((item, i) => (
                <DishCard key={item.id} item={item} i={i} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

/* ───────────────────────── About ───────────────────────── */

function About({ site }: PageProps) {
  const { t } = useTranslation();
  const l = useLocalized();
  const about = l(site.content, 'about');
  return (
    <>
      <PageBand title={t('site.nav.about')} tone="mint" />
      <section className="mx-auto max-w-3xl px-4 py-14">
        {l(site.content, 'tagline') && <p className="street-box -rotate-1 bg-[#FFCB2E] p-5 font-display text-3xl uppercase leading-tight text-[#141414]">{l(site.content, 'tagline')}</p>}
        <div className="mt-10 space-y-4 text-lg leading-relaxed">{about ? <Paragraphs text={about} /> : <p>{t('site.noStory', { name: site.name })}</p>}</div>
      </section>
      {site.content.milestones.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-14" aria-labelledby="milestones-title">
          <SectionHead id="milestones-title" title={t('site.milestonesTitle')} tone="chilli" />
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {site.content.milestones.map((m, i) => (
              <li key={i} className={`street-box bg-t-surface p-5 ${TILTS[i % TILTS.length]}`}>
                <p className="street-box-sm inline-block bg-[#7ED9B5] px-2 py-0.5 font-display text-xl">{m.year}</p>
                <h3 className="display mt-3 text-2xl">{l(m, 'title')}</h3>
                {l(m, 'text') && <p className="mt-2">{l(m, 'text')}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

/* ───────────────────────── Gallery ───────────────────────── */

function Gallery(_: PageProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useSiteGallery();
  const { category, setCategory, available, visible } = useGalleryFilter(data);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <PageBand title={t('site.nav.gallery')} tone="chilli" />
      <div className="mx-auto max-w-6xl px-4 py-12">
        {available.length > 1 && (
          <div className="mb-10 flex flex-wrap justify-center gap-2" role="group" aria-label={t('site.filterPhotos')}>
            {(['all', ...available] as const).map((c) => (
              <SquashButton key={c} aria-pressed={category === c} onClick={() => setCategory(c)} className={`street-box-sm min-h-11 px-4 font-bold uppercase ${category === c ? 'bg-t-text text-t-bg' : 'bg-t-surface'}`}>
                {c === 'all' ? t('site.allPhotos') : t(`site.galleryCat.${c}`)}
              </SquashButton>
            ))}
          </div>
        )}
        {isLoading && <p>{t('common.loading')}</p>}
        {!isLoading && !visible.length && <p className="text-center font-bold">{t('site.noGallery')}</p>}
        <ul className="grid grid-cols-2 gap-6 md:grid-cols-3">
          {visible.map((g, i) => (
            <li key={g.id}>
              <motion.button type="button" onClick={() => setOpen(i)} className={`street-box block w-full bg-t-surface p-2 text-left ${TILTS[i % TILTS.length]}`} whileHover={{ rotate: 0, y: -4 }} transition={SPRING} aria-label={t('site.openPhoto', { alt: g.alt_text })}>
                {g.image && <SiteImg image={g.image} alt="" sizes="(min-width: 768px) 30vw, 45vw" className="aspect-square w-full rounded-md" />}
                {g.caption && <span className="mt-2 block truncate px-1 text-sm font-bold">{g.caption}</span>}
              </motion.button>
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
      <PageBand title={t('site.nav.contact')} tone="mint" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2">
        <section aria-labelledby="reach-title">
          <SectionHead id="reach-title" title={t('site.contactTitle')} />
          <ContactList site={site} className="mt-8 space-y-4" itemClassName="street-box-sm flex min-h-14 items-center gap-3 bg-t-surface p-4 font-bold hover:bg-[#FFCB2E]" iconClassName="h-6 w-6" />
          <div className="mt-8 flex flex-wrap gap-4">
            <SquashA href={mapHref(site)} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
              <MapPin className="h-5 w-5" aria-hidden="true" /> {t('site.directions')}
            </SquashA>
            {c.phone && (
              <SquashA href={telHref(c.phone)} className={btnPlain}>
                <Phone className="h-5 w-5" aria-hidden="true" /> {t('site.call')}
              </SquashA>
            )}
          </div>
        </section>
        <section aria-labelledby="hours-page-title" className="street-box h-fit rotate-1 bg-t-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="hours-page-title" className="text-4xl">
              {t('site.hours')}
            </h2>
            <OpenSticker site={site} />
          </div>
          <HoursTable site={site} status={status} className="mt-5 text-sm" rowClassName="border-b-2 border-dashed border-[#141414]/30 py-2 uppercase" todayClassName="bg-[#FFCB2E] px-2 font-bold" />
        </section>
      </div>
    </>
  );
}

export const pages = { home: Home, menu: MenuPage, about: About, gallery: Gallery, contact: Contact };
