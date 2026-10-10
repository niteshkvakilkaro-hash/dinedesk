import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Search } from 'lucide-react';
import type { PageKey, PageProps } from '@/themes/types';
import { useLocalized, useSiteGallery, useSiteMenu } from '../data';
import { SiteImg } from '../components/bits';
import { ContactList, Lightbox, Paragraphs, useGalleryFilter, useHomeSections, useMenuFilter, useStory } from '../components/shared';
import type { SiteData } from '../types';
import { DishRow } from './DishCard';
import { Hero } from './Hero';
import { Divider, Hours, MapFacade, themeStyle } from './primitives';
import { HomeSections, QuickActions, Reserve } from './sections';

const delay = (i: number) => ({ ['--i' as string]: i });

function PageHeader({ site, eyebrow, title, lead }: { site: SiteData; eyebrow?: string | null; title: string; lead?: React.ReactNode }) {
  return (
    <header className={`pb-10 pt-12 md:pb-14 md:pt-20 ${site.theme.key === 'haveli' ? 's-jaali' : ''}`}>
      <div className="s-wrap">
        {eyebrow && <p className="s-reveal s-eyebrow">{eyebrow}</p>}
        <h1 className="s-reveal s-h1 mt-3 max-w-4xl" style={delay(1)}>
          {title}
        </h1>
        {lead && (
          <div className="s-reveal s-lead mt-5 max-w-2xl" style={delay(2)}>
            {lead}
          </div>
        )}
        <Divider site={site} className="s-reveal mt-10" />
      </div>
    </header>
  );
}

export function makeHome(extra?: ComponentType) {
  return function Home({ site }: PageProps) {
    const sections = useHomeSections(site);
    return (
      <>
        <Hero site={site} />
        <QuickActions site={site} />
        <HomeSections site={site} sections={sections} extra={extra} />
      </>
    );
  };
}

function Menu({ site }: PageProps) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { data: menu } = useSiteMenu();
  const { categories, vegOnly, setVegOnly, search, setSearch, hasDemo } = useMenuFilter(menu);
  const [active, setActive] = useState<string | null>(null);

  // Highlight the section being read.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: '-35% 0px -55% 0px' },
    );
    document.querySelectorAll('[data-menu-section]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [categories]);

  return (
    <>
      <PageHeader
        site={site}
        eyebrow={site.name}
        title={t('site.nav.menu')}
        lead={site.ordering.enabled ? (site.ordering.prices_include_tax ? t('site.pricesIncl') : t('site.pricesExcl')) : null}
      />
      <div className="sticky z-40 border-b border-t-line bg-t-bg/90 backdrop-blur-md" style={{ top: 'var(--s-header-h)' }}>
        <div className="s-wrap flex flex-col gap-3 py-3 lg:flex-row lg:items-center">
          <nav aria-label={t('site.categories')} className="s-tabs min-w-0 flex-1">
            {categories.map((c) => (
              <a key={c.id} href={`#cat-${c.slug}`} className={`s-chip ${active === `cat-${c.slug}` ? 'is-active' : ''}`} aria-current={active === `cat-${c.slug}` ? 'true' : undefined}>
                {l(c, 'name')}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <label className="relative flex-1 lg:w-64 lg:flex-none">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" aria-hidden="true" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('site.searchMenu')} aria-label={t('site.searchMenu')} className="s-input !min-h-10 !pl-10" />
            </label>
            <button type="button" className="s-chip" aria-pressed={vegOnly} onClick={() => setVegOnly(!vegOnly)}>
              <span className="h-2.5 w-2.5 rounded-full bg-[#2E9A55]" aria-hidden="true" />
              {t('site.vegOnly')}
            </button>
          </div>
        </div>
      </div>
      <div className="s-wrap pb-20 pt-8">
        {hasDemo && (
          <p className="s-card s-small mb-8 flex items-start gap-3 p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t('site.sampleMenu')}
          </p>
        )}
        {!menu?.length && <p className="s-muted py-16 text-center">{t('site.noMenu')}</p>}
        {!!menu?.length && !categories.length && <p className="s-muted py-16 text-center">{search ? t('site.noResults', { q: search }) : t('site.noVeg')}</p>}
        {categories.map((c) => (
          <section key={c.id} id={`cat-${c.slug}`} data-menu-section aria-labelledby={`h-${c.slug}`} className="scroll-mt-44 pt-10 lg:scroll-mt-36">
            <div className="s-reveal flex items-baseline justify-between gap-4 border-b border-t-line pb-4">
              <h2 id={`h-${c.slug}`} className="s-h2">
                {l(c, 'name')}
              </h2>
              <span className="s-small s-muted">{t('site.dishCount', { count: c.items.length })}</span>
            </div>
            <ul className="grid divide-y divide-t-line lg:grid-cols-2 lg:gap-x-12 lg:divide-y-0 [&>li]:border-t-line lg:[&>li]:border-b">
              {c.items.map((item, i) => (
                <DishRow key={item.id} item={item} index={i} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

function About({ site }: PageProps) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { about, tagline } = useStory(site);
  const { data: gallery } = useSiteGallery(site.has_gallery);
  const photo = gallery?.find((g) => g.category === 'interior' && g.image)?.image ?? site.theme.cover;
  const style = themeStyle(site);
  return (
    <>
      <PageHeader site={site} eyebrow={t('site.ourStory')} title={t('site.storyTitle', { name: site.name })} lead={tagline} />
      <section className="s-wrap s-grid gap-y-12 pb-20">
        <div className="s-reveal col-span-4 md:col-span-7 lg:col-span-6">
          <div className="s-body space-y-5 text-lg">{about ? <Paragraphs text={about} /> : <p className="s-muted">{t('site.noStory', { name: site.name })}</p>}</div>
        </div>
        {photo && (
          <div className="s-reveal col-span-4 md:col-span-5 lg:col-start-8" style={delay(1)}>
            <SiteImg image={photo} alt={t('site.coverAlt', { name: site.name })} sizes="(min-width: 1024px) 480px, 100vw" className={`s-media aspect-[4/5] w-full ${style.imageMask === 'arch' ? 's-media-arch' : ''}`} />
          </div>
        )}
      </section>
      {site.content.milestones.length > 0 && (
        <section className="s-section s-alt" aria-labelledby="milestones-title">
          <div className="s-wrap">
            <h2 id="milestones-title" className="s-reveal s-h2">
              {t('site.milestonesTitle')}
            </h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {site.content.milestones.map((m, i) => (
                <li key={`${m.year}-${i}`} className="s-reveal s-card p-6" style={delay(i % 3)}>
                  <p className="font-display text-4xl text-t-link">{m.year}</p>
                  <h3 className="s-h3 mt-3">{l(m, 'title')}</h3>
                  {l(m, 'text') && <p className="s-small s-muted mt-2">{l(m, 'text')}</p>}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
      <Reserve site={site} />
      <div className="pb-8" />
    </>
  );
}

function Gallery({ site }: PageProps) {
  const { t } = useTranslation();
  const { data } = useSiteGallery(site.has_gallery);
  const items = useMemo(() => (data ?? []).filter((g) => g.image), [data]);
  const { category, setCategory, available, visible } = useGalleryFilter(items);
  const [index, setIndex] = useState<number | null>(null);
  return (
    <>
      <PageHeader site={site} eyebrow={site.name} title={t('site.galleryTitle')} />
      <div className="s-wrap pb-20">
        {available.length > 1 && (
          <div role="group" aria-label={t('site.filterPhotos')} className="s-tabs mb-8">
            {(['all', ...available] as const).map((c) => (
              <button key={c} type="button" className="s-chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
                {c === 'all' ? t('site.allPhotos') : t(`site.galleryCat.${c}`)}
              </button>
            ))}
          </div>
        )}
        {!visible.length && <p className="s-muted py-16 text-center">{t('site.noGallery')}</p>}
        <ul className="columns-2 gap-3 md:columns-3 md:gap-4">
          {visible.map((g, i) => (
            <li key={g.id} className="s-reveal s-zoom mb-3 break-inside-avoid md:mb-4" style={delay(i % 3)}>
              <button type="button" className="block w-full" onClick={() => setIndex(i)} aria-label={t('site.openPhoto', { alt: g.alt_text })}>
                <span className="s-media block" style={{ aspectRatio: `${g.image!.width} / ${g.image!.height}` }}>
                  <SiteImg image={g.image!} alt="" sizes="(min-width: 768px) 33vw, 50vw" className="h-full w-full" />
                </span>
              </button>
              {g.caption && <p className="s-small s-muted mt-2">{g.caption}</p>}
            </li>
          ))}
        </ul>
      </div>
      <Lightbox items={visible} index={index} onClose={() => setIndex(null)} onIndex={setIndex} />
    </>
  );
}

function Contact({ site }: PageProps) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader site={site} eyebrow={site.name} title={t('site.contactTitle')} lead={t('site.contactLead')} />
      <div className="s-wrap s-grid gap-y-10 pb-12">
        <div className="col-span-4 space-y-10 md:col-span-5">
          <ContactList site={site} className="s-reveal grid gap-3" itemClassName="s-card s-card-hover flex min-h-16 items-center gap-4 p-4" iconClassName="h-5 w-5 text-t-link" />
          {site.content.contact.parking && (
            <p className="s-reveal s-card p-4">
              <span className="font-bold">{t('site.parking')}: </span>
              {site.content.contact.parking}
            </p>
          )}
          {site.opening_hours && (
            <div className="s-reveal">
              <h2 className="s-h3 mb-3">{t('site.whenOpen')}</h2>
              <Hours site={site} />
            </div>
          )}
        </div>
        <div className="s-reveal col-span-4 md:col-span-7" style={delay(1)}>
          <MapFacade site={site} className="h-full min-h-[360px]" />
        </div>
      </div>
      <Reserve site={site} />
      <div className="pb-8" />
    </>
  );
}

export function makePages(homeExtra?: ComponentType): Record<PageKey, ComponentType<PageProps>> {
  return { home: makeHome(homeExtra), menu: Menu, about: About, gallery: Gallery, contact: Contact };
}
