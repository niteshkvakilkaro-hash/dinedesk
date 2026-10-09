import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { MotionConfig } from 'motion/react';
import { Menu as MenuIcon, X } from 'lucide-react';
import { useReduceMotion } from '@/stores/motion';
import { useLocalized } from '@/site/data';
import { ReduceMotionToggle, SiteLanguageToggle } from '@/site/components/bits';
import { SiteNavLinks, SkipLink, useMobileMenu } from '@/site/components/nav';
import type { ShellProps } from '../../types';
import { ScrollSkew } from './effects';

export function Shell({ site, children }: ShellProps) {
  const { t } = useTranslation();
  const l = useLocalized();
  const [menuOpen, setMenuOpen] = useMobileMenu();
  const reduce = useReduceMotion();

  return (
    // Springs follow the OS setting and the footer "Reduce motion" switch.
    <MotionConfig reducedMotion={reduce ? 'always' : 'user'}>
      <SkipLink className="street-box-sm bg-t-accent text-t-on-accent" />
      <header className="sticky top-0 z-40 border-b-[2.5px] border-t-line bg-t-bg">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <Link to="/" className="street-box-sm flex min-h-11 -rotate-2 items-center gap-2 bg-t-accent px-3 text-t-on-accent">
            {site.theme.logo && <img src={site.theme.logo.src} alt="" width={28} height={28} className="h-7 w-7 rounded-full border-2 border-[#141414] object-cover" />}
            <span className="font-display text-lg uppercase leading-none sm:text-xl">{site.name}</span>
          </Link>
          <nav aria-label={t('site.mainNav')} className="hidden md:block">
            <SiteNavLinks site={site} className="flex items-center gap-1 font-bold uppercase" linkClassName="inline-flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-t-accent" activeClassName="bg-t-text !text-t-bg" />
          </nav>
          <div className="flex items-center gap-2">
            <SiteLanguageToggle className="street-box-sm flex h-11 min-w-11 items-center justify-center bg-t-surface px-2 text-sm font-bold" />
            <button type="button" className="street-box-sm flex h-11 w-11 items-center justify-center bg-t-primary text-t-on-primary md:hidden" aria-expanded={menuOpen} aria-controls="street-mobile-nav" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <MenuIcon className="h-6 w-6" aria-hidden="true" />}
              <span className="sr-only">{menuOpen ? t('site.menuClose') : t('site.menuOpen')}</span>
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="street-mobile-nav" aria-label={t('site.mainNav')} className="border-t-[2.5px] border-t-line bg-t-accent md:hidden">
            <SiteNavLinks site={site} className="space-y-2 px-4 py-4" linkClassName="street-box-sm block bg-t-surface px-4 py-3 font-display text-2xl uppercase" activeClassName="!bg-t-text !text-t-bg" />
          </nav>
        )}
      </header>

      <main id="main" tabIndex={-1} className="overflow-x-clip outline-none">
        <ScrollSkew>{children}</ScrollSkew>
      </main>

      <footer className="border-t-[2.5px] border-t-line bg-[#141414] text-[#FFF9EC]">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <p className="font-display text-5xl uppercase leading-none text-[#FFCB2E] sm:text-7xl">{site.name}</p>
          {l(site.content, 'tagline') && <p className="mt-3 max-w-md">{l(site.content, 'tagline')}</p>}
          <nav aria-label={t('site.footerNav')} className="mt-8">
            <SiteNavLinks site={site} className="flex flex-wrap gap-2 font-bold uppercase" linkClassName="inline-flex min-h-11 items-center rounded-lg border-2 border-[#FFF9EC] px-3 text-sm hover:bg-[#FFCB2E] hover:text-[#141414]" />
          </nav>
          <div className="mt-10 flex flex-col gap-3 border-t-2 border-white/20 pt-6 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {new Date().getFullYear()} {site.name}
            </p>
            <ReduceMotionToggle className="inline-flex min-h-11 items-center font-bold" />
            <p>{t('site.poweredBy')}</p>
          </div>
        </div>
      </footer>
    </MotionConfig>
  );
}
