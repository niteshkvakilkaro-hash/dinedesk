import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Menu, X } from 'lucide-react';
import { LanguageToggle, Logo } from '@/components/Brand';
import { useAuthStore } from '@/stores/auth';
import { FEATURE_PAGES } from './content';

/** Header, footer and page frame for DineDesk's own marketing pages. */
export default function MarketingLayout() {
  const { t } = useTranslation();
  const { pathname, hash } = useLocation();
  const signedIn = !!useAuthStore((s) => s.token);
  const [open, setOpen] = useState(false);
  const [features, setFeatures] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // New page: close menus and start at the top (or at the #section asked for).
  useEffect(() => {
    setOpen(false);
    setFeatures(false);
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  useEffect(() => {
    if (!features) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setFeatures(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [features]);

  const cta = signedIn ? { to: '/dashboard', label: t('mk.nav.dashboard') } : { to: '/signup', label: t('mk.nav.start') };
  const link = ({ isActive }: { isActive: boolean }) => `rounded-full px-3.5 py-2 text-[15px] font-semibold transition-colors ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav aria-label={t('mk.nav.main')} className="ml-6 hidden items-center lg:flex">
            <div ref={menuRef} className="relative">
              <button type="button" className={`${link({ isActive: pathname.startsWith('/features') })} inline-flex items-center gap-1`} aria-expanded={features} onClick={() => setFeatures(!features)}>
                {t('mk.nav.features')}
                <ChevronDown className={`h-4 w-4 transition-transform ${features ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {features && (
                <div className="absolute left-0 top-full mt-2 w-80 rounded-2xl border border-line bg-surface p-2 shadow-xl">
                  {FEATURE_PAGES.map(({ slug, key, icon: Icon }) => (
                    <Link key={slug} to={`/features/${slug}`} className="flex gap-3 rounded-xl p-3 hover:bg-paper">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-strong">
                        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                      </span>
                      <span>
                        <span className="block text-sm font-bold">{t(`mk.f.${key}.eyebrow`)}</span>
                        <span className="line-clamp-1 block text-xs text-muted">{t(`mk.modules.items.${key}.text`)}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <NavLink to="/themes" className={link}>
              {t('mk.nav.themes')}
            </NavLink>
            <NavLink to="/pricing" className={link}>
              {t('mk.nav.pricing')}
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:block">
              <LanguageToggle />
            </span>
            {!signedIn && (
              <Link to="/login" className="btn-ghost hidden md:inline-flex">
                {t('common.signIn')}
              </Link>
            )}
            <Link to={cta.to} className="btn-brand hidden !min-h-10 sm:inline-flex">
              {cta.label}
            </Link>
            <button type="button" className="btn-ghost !min-h-11 !px-2.5 lg:hidden" aria-expanded={open} aria-controls="mk-menu" onClick={() => setOpen(!open)} aria-label={open ? t('mk.nav.close') : t('mk.nav.menu')}>
              {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
            </button>
          </div>
        </div>
        {open && (
          <nav id="mk-menu" aria-label={t('mk.nav.main')} className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-line bg-paper px-4 pb-6 pt-2 lg:hidden">
            <p className="px-2 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-muted">{t('mk.nav.features')}</p>
            {FEATURE_PAGES.map(({ slug, key, icon: Icon }) => (
              <Link key={slug} to={`/features/${slug}`} className="flex min-h-12 items-center gap-3 rounded-xl px-2 font-semibold hover:bg-surface">
                <Icon className="h-5 w-5 text-brand" aria-hidden="true" />
                {t(`mk.f.${key}.eyebrow`)}
              </Link>
            ))}
            <div className="my-2 border-t border-line" />
            <Link to="/themes" className="flex min-h-12 items-center rounded-xl px-2 font-semibold hover:bg-surface">
              {t('mk.nav.themes')}
            </Link>
            <Link to="/pricing" className="flex min-h-12 items-center rounded-xl px-2 font-semibold hover:bg-surface">
              {t('mk.nav.pricing')}
            </Link>
            {!signedIn && (
              <Link to="/login" className="flex min-h-12 items-center rounded-xl px-2 font-semibold hover:bg-surface">
                {t('common.signIn')}
              </Link>
            )}
            <div className="mt-4 flex items-center justify-between gap-3">
              <LanguageToggle />
              <Link to={cta.to} className="btn-brand flex-1">
                {cta.label}
              </Link>
            </div>
          </nav>
        )}
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
          <div className="col-span-2">
            <Logo />
            <p className="mt-3 max-w-sm text-sm text-muted">{t('mk.footer.tagline')}</p>
            <div className="mt-5">
              <LanguageToggle />
            </div>
          </div>
          <nav aria-label={t('mk.footer.product')}>
            <p className="text-sm font-bold">{t('mk.footer.product')}</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {FEATURE_PAGES.map(({ slug, key }) => (
                <li key={slug}>
                  <Link to={`/features/${slug}`} className="hover:text-ink">
                    {t(`mk.f.${key}.eyebrow`)}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/themes" className="hover:text-ink">
                  {t('mk.nav.themes')}
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-ink">
                  {t('mk.nav.pricing')}
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label={t('mk.footer.account')}>
            <p className="text-sm font-bold">{t('mk.footer.account')}</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>
                <Link to="/signup" className="hover:text-ink">
                  {t('mk.nav.start')}
                </Link>
              </li>
              <li>
                <Link to="/login" className="hover:text-ink">
                  {t('common.signIn')}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-line">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted sm:px-6">{t('mk.footer.rights', { year: new Date().getFullYear() })}</p>
        </div>
      </footer>
    </div>
  );
}
