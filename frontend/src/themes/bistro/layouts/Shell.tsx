import { useMemo } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useReduceMotion } from '@/stores/motion';
import { useIntroOnce, useLenis } from '@/site/motion';
import { useLocalized } from '@/site/data';
import { ReduceMotionToggle, SiteLanguageToggle } from '@/site/components/bits';
import { SiteNavLinks, SkipLink, useMobileMenu } from '@/site/components/nav';
import type { ShellProps } from '../../types';
import { BistroContext, NameIntro } from './effects';

export function Shell({ site, page, children }: ShellProps) {
  const { t } = useTranslation();
  const l = useLocalized();
  const reduce = useReduceMotion();
  const [menuOpen, setMenuOpen] = useMobileMenu();
  const [playIntro, introDone] = useIntroOnce('bistro', !reduce && page === 'home');
  const scroll = useMemo(() => ({ velocity: 0 }), []);
  useLenis(!reduce, (lenis) => {
    scroll.velocity = lenis.velocity;
  });
  const ctx = useMemo(() => ({ introPlaying: playIntro, scroll }), [playIntro, scroll]);

  return (
    <BistroContext.Provider value={ctx}>
      <SkipLink className="bg-t-text text-t-bg" />
      {playIntro && <NameIntro name={site.name} onDone={introDone} />}

      <header className="sticky top-0 z-40 border-b border-t-line bg-t-bg">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
          <Link to="/" className="flex min-h-14 items-center gap-3">
            {site.theme.logo && <img src={site.theme.logo.src} alt="" width={32} height={32} className="h-8 w-8 object-cover" />}
            <span data-nav-logo className="font-display text-2xl leading-none" style={{ opacity: playIntro ? 0 : 1 }}>
              {site.name}
            </span>
          </Link>
          <nav aria-label={t('site.mainNav')} className="hidden md:block">
            <SiteNavLinks site={site} className="mono flex items-center text-xs uppercase" linkClassName="inline-flex min-h-14 items-center px-3 hover:text-[var(--t-x-primaryInk)]" activeClassName="text-[var(--t-x-primaryInk)] underline underline-offset-4" />
          </nav>
          <div className="flex items-center">
            <SiteLanguageToggle className="mono flex h-11 min-w-11 items-center justify-center text-xs font-medium uppercase hover:text-[var(--t-x-primaryInk)]" />
            <button type="button" className="mono flex h-11 items-center px-2 text-xs uppercase md:hidden" aria-expanded={menuOpen} aria-controls="bistro-mobile-nav" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? t('site.menuClose') : t('site.menuOpen')}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="bistro-mobile-nav" aria-label={t('site.mainNav')} className="border-t border-t-line md:hidden">
            <SiteNavLinks site={site} className="divide-y divide-t-line/30 px-4" linkClassName="block py-4 font-display text-4xl" activeClassName="text-[var(--t-x-primaryInk)]" />
          </nav>
        )}
      </header>

      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>

      <footer className="mt-16 border-t border-t-line">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-8">
          <div className="grid gap-8 md:grid-cols-12">
            <div className="md:col-span-7">
              <p className="font-display text-5xl leading-none sm:text-7xl">{site.name}</p>
              {l(site.content, 'tagline') && <p className="mt-4 max-w-md text-t-muted">{l(site.content, 'tagline')}</p>}
            </div>
            <nav aria-label={t('site.footerNav')} className="md:col-span-5">
              <SiteNavLinks site={site} className="mono grid grid-cols-2 text-sm uppercase" linkClassName="inline-flex min-h-11 items-center hover:text-[var(--t-x-primaryInk)]" />
            </nav>
          </div>
          <div className="mono mt-10 flex flex-col gap-3 border-t border-t-line pt-6 text-xs uppercase text-t-muted sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {new Date().getFullYear()} {site.name}
            </p>
            <ReduceMotionToggle className="inline-flex min-h-11 items-center text-t-text" />
            <p>{t('site.poweredBy')}</p>
          </div>
        </div>
      </footer>
    </BistroContext.Provider>
  );
}
