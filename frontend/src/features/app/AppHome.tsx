import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronRight, Clock, LayoutDashboard, MapPin, QrCode, Search, Store, X } from 'lucide-react';
import { api, ApiError, type Paginated } from '@/lib/api';
import { forgetPlaces, recentPlaces, withAppFlag, type RecentPlace } from '@/lib/dinedeskApp';
import { useAuthStore } from '@/stores/auth';
import { useSession } from '@/hooks/useSession';
import { useReduceMotion } from '@/stores/motion';
import { LanguageToggle, LogoMark } from '@/components/Brand';
import { Spinner } from '@/components/ui';
import { QrScanner } from './QrScanner';
import { openPlace, placeHref, type Place } from './places';

const SPLASH_KEY = 'dd_app_splash';

function useSplash() {
  const reduce = useReduceMotion();
  const [show, setShow] = useState(() => {
    try {
      return sessionStorage.getItem(SPLASH_KEY) !== '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!show) return;
    try {
      sessionStorage.setItem(SPLASH_KEY, '1');
    } catch {
      /* ignore */
    }
    const id = window.setTimeout(() => setShow(false), reduce ? 600 : 1100);
    return () => window.clearTimeout(id);
  }, [show, reduce]);
  return { show, reduce };
}

function Splash({ reduce }: { reduce: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#14110f] text-[#fbf8f3]" role="status" aria-label={t('common.loading')}>
      <div className={reduce ? '' : 'dd-splash-in'}>
        <LogoMark className="h-24 w-24 !rounded-3xl shadow-[0_0_0_1px_rgb(242_181_68/0.35),0_24px_60px_-20px_rgb(242_181_68/0.45)]" />
      </div>
      <p className={`mt-6 text-3xl font-extrabold tracking-tight ${reduce ? '' : 'dd-splash-in [animation-delay:120ms]'}`}>DineDesk</p>
      <p className={`mt-2 text-sm text-[#fbf8f3]/65 ${reduce ? '' : 'dd-splash-in [animation-delay:240ms]'}`}>{t('app.tagline')}</p>
      <span className="absolute bottom-[calc(2.5rem+env(safe-area-inset-bottom))] h-0.5 w-16 rounded-full bg-[#f2b544]" aria-hidden="true" />
    </div>
  );
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** The app is its own installable start page: swap the dashboard's manifest for the app's while here. */
function useAppManifest() {
  useEffect(() => {
    // This runs before PlatformApp's own effect, which then keeps the link it finds.
    const found = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const before = found?.getAttribute('href') ?? '/admin.webmanifest';
    const link = found ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'manifest' }));
    link.setAttribute('href', '/app.webmanifest');
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const color = meta?.content ?? null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = '#14110f';
    return () => {
      link.setAttribute('href', before);
      if (meta && color !== null) meta.content = color;
    };
  }, []);
}

function Thumb({ place, className = '' }: { place: { name: string; logo?: string | null; cover?: string | null }; className?: string }) {
  const src = place.cover ?? place.logo;
  return src ? (
    <img src={src} alt="" loading="lazy" decoding="async" className={`shrink-0 bg-line object-cover ${className}`} />
  ) : (
    <span className={`flex shrink-0 items-center justify-center bg-ink text-xl font-extrabold text-[#f2b544] ${className}`} aria-hidden="true">
      {place.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function PlaceCard({ place }: { place: Place }) {
  const { t } = useTranslation();
  const href = placeHref(place);
  return (
    <li>
      <a
        href={withAppFlag(href)}
        onClick={(e) => {
          e.preventDefault();
          openPlace(place, href);
        }}
        className="card flex items-center gap-3 p-2.5 pr-3 shadow-[0_1px_2px_rgb(20_17_15/0.05)] transition-transform active:scale-[0.99]"
      >
        <span className="relative">
          <Thumb place={{ name: place.name, cover: place.cover?.src, logo: place.logo?.src }} className="h-[72px] w-[72px] rounded-xl" />
          {place.logo && place.cover && <img src={place.logo.src} alt="" className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full border-2 border-surface bg-surface object-contain" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-bold">{place.name}</span>
            {place.is_demo && <span className="shrink-0 rounded bg-ink px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-paper">{t('common.demo')}</span>}
          </span>
          <span className="mt-0.5 block truncate text-sm text-muted">
            {t(`types.${place.business_type}`, { defaultValue: place.business_type })}
            {place.city && ` · ${place.city}`}
          </span>
          {place.is_open !== null && (
            <span className={`mt-1 inline-flex items-center gap-1 text-xs font-bold ${place.is_open ? 'text-success' : 'text-muted'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${place.is_open ? 'bg-success' : 'bg-muted/60'}`} aria-hidden="true" />
              {place.is_open ? t('site.openNow') : t('site.closedNow')}
            </span>
          )}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted rtl:rotate-180" aria-hidden="true" />
      </a>
    </li>
  );
}

function Recent({ list, onClear }: { list: RecentPlace[]; onClear: () => void }) {
  const { t } = useTranslation();
  if (!list.length) return null;
  return (
    <section aria-labelledby="recent-h">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="recent-h" className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-muted">
          <Clock className="h-4 w-4" aria-hidden="true" /> {t('app.recent')}
        </h2>
        <button type="button" className="min-h-9 px-2 text-sm font-semibold text-muted underline" onClick={onClear}>
          {t('app.clearRecent')}
        </button>
      </div>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {list.map((p) => (
          <li key={p.host} className="w-[104px] shrink-0 snap-start">
            <a
              href={withAppFlag(placeHref(p))}
              onClick={(e) => {
                e.preventDefault();
                openPlace({ ...p, business_type: p.business_type ?? '', city: p.city ?? null, logo: p.logo ? { src: p.logo, srcset: '' } : null });
              }}
              className="block text-center"
            >
              <Thumb place={{ name: p.name, logo: p.logo }} className="mx-auto h-[72px] w-[72px] rounded-2xl border border-line" />
              <span className="mt-1.5 line-clamp-2 text-xs font-semibold leading-tight">{p.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ForBusiness() {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const { data: session } = useSession();
  const home = session ? (session.next === 'platform' ? '/platform' : session.next === 'onboarding' ? '/onboarding' : '/dashboard') : null;
  return (
    <section className="overflow-hidden rounded-card bg-ink text-paper" aria-labelledby="biz-h">
      <div className="flex items-start gap-3 p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f2b544] text-ink">
          <Store className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="biz-h" className="text-lg font-extrabold leading-snug">
            {t('app.businessTitle')}
          </h2>
          <p className="mt-1 text-sm text-paper/70">{t('app.businessText')}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 px-5 pb-5 sm:flex-row-reverse">
        {token && home ? (
          <Link to={home} className="btn w-full bg-[#f2b544] text-ink hover:bg-[#f2b544]/90">
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> {t('app.openDashboard')}
          </Link>
        ) : (
          <>
            <Link to="/signup" className="btn flex-1 bg-[#f2b544] text-ink hover:bg-[#f2b544]/90">
              {t('app.startTrial')} <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
            <Link to="/login" className="btn flex-1 border border-paper/25 text-paper hover:bg-paper/10">
              {t('common.signIn')}
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

/** /app on the platform host: the DineDesk app's start screen, for guests and for businesses. */
export default function AppHome() {
  const { t } = useTranslation();
  const splash = useSplash();
  useAppManifest();
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const [scan, setScan] = useState(false);
  const [recent, setRecent] = useState<RecentPlace[]>(() => recentPlaces());
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = `DineDesk — ${t('app.findTitle')}`;
  }, [t]);
  // Coming back (browser back from a place) shows the latest list.
  useEffect(() => {
    const onShow = () => setRecent(recentPlaces());
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  const places = useInfiniteQuery({
    queryKey: ['directory', query],
    queryFn: async ({ pageParam }) => {
      const res = await api.get<Place[]>('/directory', { q: query, page: pageParam });
      return { items: res.data, meta: res.meta as unknown as Paginated };
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined),
    staleTime: 60_000,
  });
  const items = places.data?.pages.flatMap((p) => p.items) ?? [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    input.current?.blur();
  };

  return (
    <div className="min-h-svh bg-paper text-ink">
      {splash.show && <Splash reduce={splash.reduce} />}
      <header className="bg-ink pt-[env(safe-area-inset-top)] text-paper">
        <div className="mx-auto max-w-xl px-4">
          <div className="flex h-14 items-center justify-between gap-3">
            <span className="flex items-center gap-2.5">
              <LogoMark className="h-8 w-8 ring-1 ring-paper/15" />
              <span className="text-lg font-extrabold tracking-tight">DineDesk</span>
            </span>
            <LanguageToggle light />
          </div>
          <div className="pb-5 pt-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#f2b544]">{t('app.forGuests')}</p>
            <h1 className="mt-1 text-[1.65rem] font-extrabold leading-tight tracking-tight">{t('app.findTitle')}</h1>
            <p className="mt-1 text-sm text-paper/70">{t('app.findText')}</p>
            <form role="search" onSubmit={submit} className="mt-4 flex gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">{t('app.searchLabel')}</span>
                <Search className="pointer-events-none absolute start-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input
                  ref={input}
                  type="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  maxLength={80}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t('app.searchPlaceholder')}
                  className="h-12 w-full rounded-xl border-0 bg-surface pe-10 ps-11 [&::-webkit-search-cancel-button]:appearance-none text-[15px] text-ink placeholder:text-muted/80 focus:outline-none focus:ring-2 focus:ring-[#f2b544]"
                />
                {q && (
                  <button type="button" onClick={() => setQ('')} className="absolute end-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted" aria-label={t('app.clearSearch')}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </label>
              <button type="button" onClick={() => setScan(true)} className="flex h-12 shrink-0 items-center gap-1.5 rounded-xl bg-[#f2b544] px-3.5 text-sm font-bold text-ink active:scale-[0.98]">
                <QrCode className="h-5 w-5" aria-hidden="true" />
                {t('app.scanQr')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-6 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-5">
        {!query && (
          <Recent
            list={recent}
            onClear={() => {
              forgetPlaces();
              setRecent([]);
            }}
          />
        )}

        {!query && <ForBusiness />}

        <section aria-labelledby="places-h" aria-busy={places.isFetching || undefined}>
          <h2 id="places-h" className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-muted">
            <MapPin className="h-4 w-4" aria-hidden="true" /> {query ? t('app.results') : t('app.places')}
          </h2>
          {places.isPending ? (
            <ul className="space-y-2.5" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="card flex items-center gap-3 p-2.5">
                  <span className="skeleton h-[72px] w-[72px] rounded-xl" />
                  <span className="flex-1 space-y-2">
                    <span className="skeleton block h-4 w-2/3" />
                    <span className="skeleton block h-3 w-1/2" />
                  </span>
                </li>
              ))}
            </ul>
          ) : places.isError ? (
            <div className="card p-5 text-center">
              <p className="font-semibold">{places.error instanceof ApiError ? places.error.message : t('common.somethingWrong')}</p>
              <button type="button" className="btn-outline mt-3" onClick={() => void places.refetch()}>
                {t('common.retry')}
              </button>
            </div>
          ) : items.length === 0 ? (
            <p className="card p-5 text-center text-muted" role="status">
              {query ? t('app.noPlaces', { q: query }) : t('app.noPlacesYet')}
            </p>
          ) : (
            <>
              <ul className="space-y-2.5">
                {items.map((p) => (
                  <PlaceCard key={p.host} place={p} />
                ))}
              </ul>
              {places.hasNextPage && (
                <button type="button" className="btn-outline mt-4 w-full" disabled={places.isFetchingNextPage} onClick={() => void places.fetchNextPage()}>
                  {places.isFetchingNextPage ? <Spinner /> : t('app.loadMore')}
                </button>
              )}
            </>
          )}
        </section>

        {query && <ForBusiness />}
      </main>

      {scan && <QrScanner onClose={() => setScan(false)} />}
    </div>
  );
}
