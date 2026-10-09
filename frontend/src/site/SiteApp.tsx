import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api';
import { platformUrl } from '@/lib/host';
import { useReduceMotion } from '@/stores/motion';
import { LogoMark } from '@/components/Brand';
import { getTheme, isThemeKey, themeVars } from '@/themes/registry';
import type { PageKey, ThemeKey, ThemeModule } from '@/themes/types';
import { useOpenStatus, useSite, useSiteGallery, useSiteMenu } from './data';
import { Seo } from './Seo';
import { PREVIEW } from './preview';
import { SkinContext } from './order/skin';
import { Cart } from './order/Cart';
import { PhotoCredits, WhatsAppButton } from './order/extras';
import CheckoutPage from './order/CheckoutPage';
import TrackPage from './order/TrackPage';
import { useOpenLabel } from './components/bits';
import type { SectionKey, SiteData } from './types';

/** Messages the dashboard's theme picker sends into the preview iframe. */
interface PreviewMessage {
  type: 'dd:preview';
  theme?: ThemeKey;
  primary_color?: string | null;
  accent_color?: string | null;
  sections?: { key: SectionKey; visible: boolean }[];
}

function usePreviewOverrides(initialTheme: string | null) {
  const [overrides, setOverrides] = useState<Omit<PreviewMessage, 'type'>>(() => (isThemeKey(initialTheme) ? { theme: initialTheme } : {}));
  useEffect(() => {
    if (!PREVIEW) return;
    const allowed = new URL(platformUrl('/')).origin;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== allowed || typeof e.data !== 'object' || e.data?.type !== 'dd:preview') return;
      const { type: _type, ...rest } = e.data as PreviewMessage;
      setOverrides((prev) => ({ ...prev, ...rest }));
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'dd:preview-ready' }, allowed);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return overrides;
}

/** Loads a theme's layout chunk once the site (and so its theme) is known. */
function useThemeModule(key: ThemeKey | null) {
  const [loaded, setLoaded] = useState<{ key: ThemeKey; module: ThemeModule } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    setFailed(false);
    getTheme(key)
      .load()
      .then(async (module) => {
        // Fetch the theme's key fonts now and paint once they're in (or after 1.5s at most):
        // a late font swap would reflow the big headings (layout shift).
        if (module.fonts?.length && typeof document !== 'undefined' && document.fonts) {
          await Promise.race([Promise.all(module.fonts.map((f) => document.fonts.load(f))).catch(() => null), new Promise((r) => setTimeout(r, 1500))]);
        }
        if (alive) setLoaded({ key, module });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [key]);
  return { module: loaded?.key === key ? loaded.module : null, failed };
}

function Spinner({ className = '' }: { className?: string }) {
  return <span role="status" aria-label="Loading" className={`inline-block animate-spin rounded-full border-[3px] border-current border-t-transparent opacity-60 ${className}`} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">{children}</main>;
}

function NotFound({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return (
    <Centered>
      <LogoMark className="h-12 w-12" />
      <h1 className="mt-5 text-3xl font-extrabold">{t('site.notFoundTitle')}</h1>
      <p className="mt-2 text-muted">{error instanceof ApiError && error.status !== 404 ? error.message : t('site.notFoundText')}</p>
    </Centered>
  );
}

/** Unpublished sites show only this to visitors (the owner sees the full site in the preview). */
function ComingSoon({ site, style }: { site: SiteData; style: CSSProperties }) {
  const { t } = useTranslation();
  const status = useOpenLabel(useOpenStatus(site));
  return (
    <div style={style} className="site-root flex min-h-screen flex-col items-center justify-center bg-t-bg px-6 text-center text-t-text">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-t-muted">{t('site.comingSoonTitle')}</p>
      <h1 className="mt-4 font-display text-5xl leading-tight sm:text-6xl">{site.name}</h1>
      <p className="mt-4 max-w-md text-t-muted">{t('site.comingSoonText', { name: site.name })}</p>
      {status && (
        <p className="mt-6 text-sm font-semibold">
          {status.label}
          {status.detail && ` · ${status.detail}`}
        </p>
      )}
    </div>
  );
}

function DemoStrip() {
  const { t } = useTranslation();
  return (
    <div className="bg-[#141414] px-4 py-1.5 text-center text-xs font-semibold text-white" role="note">
      <span className="mr-2 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#141414]">{t('common.demo')}</span>
      {t('site.demoNotice')}
    </div>
  );
}

const PAGES: { path: string; key: PageKey }[] = [
  { path: '/', key: 'home' },
  { path: '/menu', key: 'menu' },
  { path: '/about', key: 'about' },
  { path: '/gallery', key: 'gallery' },
  { path: '/contact', key: 'contact' },
];

/** The theme's header/footer stay mounted while pages change inside them. */
function SiteLayout({ site, module, themeColor }: { site: SiteData; module: ThemeModule; themeColor: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { Shell } = module;
  const page = PAGES.find((p) => p.path === pathname)?.key ?? 'home';
  // Checkout and order pages are private: never indexed.
  const privateTitle = pathname.startsWith('/checkout') ? t('order.checkoutTitle') : pathname.startsWith('/order/') ? t('order.trackTitle') : null;
  return (
    <SkinContext.Provider value={module.skin}>
      <Seo site={site} page={page} themeColor={themeColor} title={privateTitle} />
      <Shell site={site} page={page}>
        <Outlet />
      </Shell>
      <PhotoCredits site={site} />
      <Cart />
      <WhatsAppButton site={site} />
    </SkinContext.Provider>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function SiteApp() {
  const { i18n } = useTranslation();
  const query = useSite();
  // Fetched in parallel with the theme chunk, so sections render complete (no layout shift).
  const menu = useSiteMenu();
  const gallery = useSiteGallery(!!query.data?.has_gallery);
  const reduce = useReduceMotion();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const overrides = usePreviewOverrides(PREVIEW ? params.get('preview_theme') : null);

  useEffect(() => {
    const lang = params.get('lang');
    if (lang === 'hi' || lang === 'en') void i18n.changeLanguage(lang);
  }, [params, i18n]);

  const raw = query.data;
  const site: SiteData | undefined = useMemo(() => {
    if (!raw) return raw;
    return {
      ...raw,
      theme: {
        ...raw.theme,
        key: overrides.theme ?? raw.theme.key,
        primary_color: overrides.primary_color !== undefined ? overrides.primary_color : raw.theme.primary_color,
        accent_color: overrides.accent_color !== undefined ? overrides.accent_color : raw.theme.accent_color,
        sections: overrides.sections ?? raw.theme.sections,
      },
    };
  }, [raw, overrides]);

  const def = getTheme(site?.theme.key);
  const { module, failed } = useThemeModule(site ? def.key : null);
  const hindi = i18n.language?.startsWith('hi');
  useEffect(() => {
    if (hindi) void module?.loadHindiFonts?.();
  }, [hindi, module]);
  const style = useMemo(() => themeVars(def, { primary: site?.theme.primary_color, accent: site?.theme.accent_color }) as CSSProperties, [def, site?.theme.primary_color, site?.theme.accent_color]);

  if (query.isLoading) {
    return (
      <Centered>
        <Spinner className="h-8 w-8" />
      </Centered>
    );
  }
  if (query.isError || !site) return <NotFound error={query.error} />;
  if (!site.is_live && !PREVIEW) return <ComingSoon site={site} style={style} />;
  if (failed) return <NotFound error={null} />;
  // Sections that show dishes or photos render complete: wait for that (already in-flight) data too.
  const dataPending = (site.has_menu && menu.isPending) || (site.has_gallery && gallery.isPending);
  if (!module || dataPending) {
    return (
      <div style={style} className="min-h-screen bg-t-bg" aria-busy="true">
        <Centered>
          <Spinner className="h-8 w-8" />
        </Centered>
      </div>
    );
  }

  const { pages } = module;
  return (
    <HelmetProvider>
      <div style={style} className={`site-root theme-${def.key} min-h-screen bg-t-bg font-body text-t-text`} data-reduce-motion={reduce || undefined}>
        {site.is_demo && <DemoStrip />}
        <ScrollToTop />
        <Routes>
          {/* Keyed by theme so a preview switch replays that theme's entrance. */}
          <Route element={<SiteLayout key={def.key} site={site} module={module} themeColor={(style as Record<string, string>)['--t-primary']} />}>
            {PAGES.map(({ path, key }) => {
              const Page = pages[key];
              return <Route key={key} path={path} element={<Page site={site} />} />;
            })}
            <Route path="/checkout" element={<CheckoutPage site={site} />} />
            <Route path="/order/:id" element={<TrackPage site={site} />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </HelmetProvider>
  );
}

