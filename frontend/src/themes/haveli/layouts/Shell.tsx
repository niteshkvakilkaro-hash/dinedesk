import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Menu as MenuIcon, X } from 'lucide-react';
import { useReduceMotion } from '@/stores/motion';
import { useIntroOnce } from '@/site/motion';
import { useLocalized } from '@/site/data';
import { ReduceMotionToggle, SiteLanguageToggle } from '@/site/components/bits';
import { SiteNavLinks, SkipLink, useMobileMenu } from '@/site/components/nav';
import type { ShellProps } from '../../types';
import { DoorsIntro } from './DoorsIntro';
import { Jaali, JharokhaDefs, LotusDivider } from './ornaments';

export function Brand({ site, light = false }: { site: ShellProps['site']; light?: boolean }) {
  return (
    <Link to="/" className="flex min-h-11 items-center gap-2.5">
      {site.theme.logo ? (
        <img src={site.theme.logo.src} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
      ) : (
        <span aria-hidden="true" className={`flex h-10 w-10 items-center justify-center rounded-full border font-display text-lg ${light ? 'border-[#C9A45C] text-[#FFF8E9]' : 'border-t-accent text-t-primary'}`}>
          {site.name.charAt(0)}
        </span>
      )}
      <span className={`font-display text-xl leading-none sm:text-2xl ${light ? 'text-[#FFF8E9]' : 'text-t-primary'}`}>{site.name}</span>
    </Link>
  );
}

export function Shell({ site, page, children }: ShellProps) {
  const { t } = useTranslation();
  const reduce = useReduceMotion();
  const l = useLocalized();
  const [menuOpen, setMenuOpen] = useMobileMenu();
  const [playIntro, introDone] = useIntroOnce('haveli', !reduce && page === 'home');

  return (
    <>
      <SkipLink className="bg-t-primary text-t-on-primary" />
      <JharokhaDefs />
      {playIntro && <DoorsIntro onDone={introDone} heroSelector="[data-hero-media]" />}

      <header className="sticky top-0 z-40 border-b border-t-line bg-t-bg/95 backdrop-blur supports-[backdrop-filter]:bg-t-bg/85">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
          <Brand site={site} />
          <nav aria-label={t('site.mainNav')} className="hidden md:block">
            <SiteNavLinks site={site} className="flex items-center gap-1" linkClassName="rounded px-3 py-2 text-[15px] font-semibold text-t-text hover:text-t-primary" activeClassName="!text-t-primary underline decoration-t-accent decoration-2 underline-offset-8" />
          </nav>
          <div className="flex items-center gap-1">
            <SiteLanguageToggle className="flex h-11 min-w-11 items-center justify-center rounded-full px-2 text-sm font-bold text-t-primary hover:bg-t-primary/5" />
            <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full text-t-primary hover:bg-t-primary/5 md:hidden" aria-expanded={menuOpen} aria-controls="haveli-mobile-nav" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <MenuIcon className="h-6 w-6" aria-hidden="true" />}
              <span className="sr-only">{menuOpen ? t('site.menuClose') : t('site.menuOpen')}</span>
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="haveli-mobile-nav" aria-label={t('site.mainNav')} className="relative overflow-hidden border-t border-t-line bg-t-primary md:hidden">
            <Jaali opacity={0.2} />
            <SiteNavLinks site={site} className="relative space-y-1 px-4 py-4" linkClassName="block rounded px-3 py-3 font-display text-2xl text-[#FFF8E9]" activeClassName="bg-white/10" />
          </nav>
        )}
      </header>

      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>

      <footer className="relative overflow-hidden bg-[var(--t-x-maroonDeep)] text-[#FFF8E9]">
        <Jaali opacity={0.12} />
        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="flex flex-col items-center text-center">
            <Brand site={site} light />
            {l(site.content, 'tagline') && <p className="mt-3 max-w-md text-[#F1E2BC]">{l(site.content, 'tagline')}</p>}
            <LotusDivider light className="mt-6" />
            <nav aria-label={t('site.footerNav')} className="mt-6">
              <SiteNavLinks site={site} className="flex flex-wrap justify-center gap-x-2 gap-y-1" linkClassName="inline-flex min-h-11 items-center rounded px-3 text-[15px] text-[#FFF8E9] hover:underline" />
            </nav>
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-white/15 pt-6 text-sm text-[#F1E2BC] sm:flex-row">
            <p>
              © {new Date().getFullYear()} {site.name}
            </p>
            <ReduceMotionToggle className="inline-flex min-h-11 items-center rounded px-2 hover:text-white" />
            <p>{t('site.poweredBy')}</p>
          </div>
        </div>
      </footer>
    </>
  );
}
