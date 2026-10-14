import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LogOut, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Search, UserRound, Wifi } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { disconnectLive, useLive, useLiveStatus } from '@/lib/realtime';
import { useCan, useFeature, useSaveLanguage, useSession, useSignOut } from '@/hooks/useSession';
import { Alert, Dialog, DemoBadge, toast } from '@/components/ui';
import { LanguageToggle, Logo } from '@/components/Brand';
import { useAdminTheme } from '@/lib/adminTheme';
import { Appearance } from './Appearance';
import { useOrderAlerts } from '@/features/orders/alerts';
import { useReservationAlerts } from '@/features/reservations/api';
import { useTableAlerts } from '@/features/tables/api';
import { BillingBanner, OutletSwitcher, SupportBar } from './AccountBanners';
import { accessFrom, navGroups, SETTINGS_PAGES, type BadgeKey } from './navigation';
import { CommandPalette, rememberPage, shortcutLabel } from './CommandPalette';
import { SettingsBackLink } from './SettingsHub';

export default function DashboardLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: session } = useSession();
  const signOut = useSignOut();
  // The header language menu also saves the choice on the account (alerts to this person use it).
  const saveLanguage = useSaveLanguage();
  const canOrders = useCan('orders.view');
  const hasReservations = useFeature('reservations');
  const hasQr = useFeature('qr_ordering');
  const canManageReservations = useCan('reservations.manage');
  const canRunTables = useCan('tables.manage');
  const canReservations = canManageReservations && hasReservations;
  // One set of gates for the sidebar, the Settings page and the search.
  const access = useMemo(() => accessFrom(session), [session]);

  // Live updates: any change refreshes the screens that show it (polling stays as a fallback).
  const qc = useQueryClient();
  const live = useLiveStatus((s) => s.connected);
  const tenantKey = session?.tenant?.id;
  const refresh = (...keys: string[]) => keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  useLive(tenantKey, 'orders', canOrders, () => refresh('orders', 'orders-feed', 'pos-open', 'day-report'));
  useLive(tenantKey, 'reservations', canReservations, () => refresh('reservations', 'reservations-feed'));
  useLive(tenantKey, 'tables', canRunTables && hasQr, () => refresh('tables-live', 'tables-feed', 'pos-open'));
  const [more, setMore] = useState(false);
  const [theme] = useAdminTheme();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('dd_sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('dd_sidebar', c ? 'open' : 'collapsed');
      } catch {
        /* private mode */
      }
      return !c;
    });
  };
  const tenant = session?.tenant;

  // New orders anywhere in the dashboard: chime + a toast that opens Orders.
  const feed = useOrderAlerts(canOrders, (f) => {
    for (const o of f.new) toast.success(t('orders.newToast', { number: o.number, name: o.customer_name }));
  });
  const pending = feed?.counts.pending ?? 0;
  // New website bookings and waiter / bill calls ring too.
  const bookings = useReservationAlerts(canReservations, (items) => {
    for (const r of items) toast.success(t('reservationsAdmin.newToast', { name: r.name, count: r.party_size, time: r.time }));
  });
  const tableFeed = useTableAlerts(canRunTables && hasQr, (items) => {
    for (const r of items) toast.success(t(`tablesAdmin.toast.${r.type}`, { table: r.table ?? '' }));
  });
  useEffect(() => setMore(false), [pathname]);
  // Search: the header button, or Ctrl K / ⌘K from anywhere in the dashboard.
  const [finding, setFinding] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setFinding((f) => !f);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => rememberPage(pathname), [pathname]);
  // Keep the current page visible in a long sidebar.
  const sideNav = useRef<HTMLElement>(null);
  useEffect(() => {
    sideNav.current?.querySelector('a[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
  }, [pathname, collapsed]);

  const badges: Record<BadgeKey, number> = { orders: pending, bookings: bookings?.pending ?? 0, tables: tableFeed?.open ?? 0 };
  const groups = navGroups(access).map((g) => ({
    key: g.key,
    items: g.items.map((i) => ({ ...i, label: t(`dashboard.nav.${i.label}`), badge: i.badge ? badges[i.badge] : undefined })),
  }));
  type NavItem = (typeof groups)[number]['items'][number];
  // Same rule as NavLink (the page or anything under it), plus Settings lighting up on every settings page.
  const isActive = (i: NavItem) => {
    if (i.activeFor) return i.activeFor(pathname);
    const base = i.to.replace(/(.)\/+$/, '$1');
    return pathname === base || pathname === `${base}/` || (!i.end && pathname.startsWith(`${base}/`));
  };
  const nav = groups.flatMap((g) => g.items);
  // Phones and tablets: the first four as tabs, the rest (grouped) under "More".
  const tabs = nav.length > 5 ? nav.slice(0, 4) : nav;
  const tabSet = new Set(tabs.map((n) => n.to));
  const overflowGroups = groups.map((g) => ({ ...g, items: g.items.filter((i) => !tabSet.has(i.to)) })).filter((g) => g.items.length > 0);
  const overflow = overflowGroups.flatMap((g) => g.items);
  // Only one group (e.g. kitchen or housekeeping staff): no group headings.
  // The single Settings item never needs a heading of its own.
  const showHeadings = groups.filter((g) => g.key !== 'settings').length > 1;
  const heading = (key: string) => showHeadings && key !== 'settings';
  const shortcut = shortcutLabel();

  const badge = (n?: number) =>
    n ? (
      <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold leading-5 text-white tabular-nums" aria-label={t('orders.pendingCount', { count: n })}>
        {n}
      </span>
    ) : null;

  return (
    <div className="min-h-screen pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      {session && <SupportBar session={session} />}
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Logo to="/dashboard" compact />
            {tenant && (
              <span className="hidden min-w-0 items-center gap-2 border-l border-line pl-3 sm:flex">
                <span className="truncate font-semibold">{tenant.name}</span>
                {tenant.is_demo && <DemoBadge />}
              </span>
            )}
          </div>
          {/* Search: an input-like button on big screens, an icon on phones. */}
          <button
            type="button"
            onClick={() => setFinding(true)}
            aria-haspopup="dialog"
            aria-keyshortcuts="Control+K Meta+K"
            className="hidden h-10 min-w-0 max-w-sm flex-1 items-center gap-2.5 rounded-full border border-line bg-surface px-4 text-sm text-muted transition-colors hover:border-ink/30 md:flex"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{t('dashboard.find.hint')}</span>
            <kbd className="ms-auto shrink-0 rounded-md border border-line bg-paper px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted">{shortcut}</kbd>
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setFinding(true)} aria-haspopup="dialog" className="btn-ghost !min-h-10 !px-2.5 md:hidden" aria-label={t('dashboard.find.hint')}>
              <Search className="h-5 w-5" aria-hidden="true" />
            </button>
            {session && <OutletSwitcher session={session} />}
            {live && (
              <span className="hidden items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-xs font-bold text-success sm:inline-flex" title={t('dashboard.liveHint')}>
                <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> {t('kds.live')}
              </span>
            )}
            <Appearance theme={theme} />
            <LanguageToggle onPick={(code) => void saveLanguage(code).catch(() => undefined)} />
            <Link to="/dashboard/account" className="btn-ghost !min-h-10 !px-2.5" aria-label={t('dashboard.nav.account')} title={t('dashboard.nav.account')} aria-current={pathname.startsWith('/dashboard/account') ? 'page' : undefined}>
              <UserRound className="h-5 w-5" aria-hidden="true" />
              {session && <span className="hidden max-w-[9rem] truncate xl:inline">{session.user.name}</span>}
            </Link>
            <button type="button" onClick={() => { disconnectLive(); void signOut(); }} className="btn-ghost !min-h-10 !px-3" aria-label={t('common.signOut')}>
              <LogOut className="h-5 w-5" aria-hidden="true" />
              <span className="hidden sm:inline">{t('common.signOut')}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="lg:flex">
        {/* Desktop: grouped sidebar; it can shrink to icons to give big screens (POS, previews) more room. */}
        <aside className={`sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 flex-col border-r border-side-line bg-side text-side-ink transition-[width] duration-200 lg:flex ${collapsed ? 'w-[4.5rem]' : 'w-60'}`}>
          <nav ref={sideNav} aria-label={t('dashboard.nav.label')} className="flex min-h-0 flex-1 flex-col">
            {/* Settings stays pinned at the bottom; the rest scrolls. */}
            {[groups.filter((g) => g.key !== 'settings'), groups.filter((g) => g.key === 'settings')].map((part, p) => !!part.length && (
            <div key={p} className={p === 0 ? 'min-h-0 flex-1 overflow-y-auto px-3 py-4' : 'border-t border-side-line px-3 py-2'}>
            {part.map((g) => (
              <div key={g.key} className="mb-3 last:mb-0">
                {heading(g.key) && !collapsed && <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-side-heading">{t(`dashboard.groups.${g.key}`)}</p>}
                {heading(g.key) && collapsed && <div className="mx-3 mb-2 border-t border-side-line" aria-hidden="true" />}
                <ul className="space-y-0.5">
                  {g.items.map((i) => {
                    const { to, label, icon: Icon, badge: n } = i;
                    const active = isActive(i);
                    return (
                      <li key={to}>
                        <Link
                          to={to}
                          aria-current={active ? 'page' : undefined}
                          title={collapsed ? label : undefined}
                          aria-label={collapsed ? label : undefined}
                          className={`relative flex min-h-9 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors ${active ? 'bg-side-active text-side-active-ink' : 'text-side-muted hover:bg-side-hover hover:text-side-ink'} ${collapsed ? 'justify-center' : ''}`}
                        >
                          <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                          {!collapsed && <span className="truncate">{label}</span>}
                          {collapsed ? !!n && <span className="absolute right-1.5 top-1 h-2 w-2 rounded-full bg-brand" aria-label={t('orders.pendingCount', { count: n })} /> : badge(n)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            </div>
            ))}
          </nav>
          <button type="button" onClick={toggleCollapsed} className="flex min-h-11 items-center gap-2 border-t border-side-line px-6 text-sm font-semibold text-side-muted hover:text-side-ink" aria-label={collapsed ? t('dashboard.expandMenu') : t('dashboard.collapseMenu')} aria-expanded={!collapsed}>
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden="true" /> : <><PanelLeftClose className="h-[18px] w-[18px]" aria-hidden="true" /> {t('dashboard.collapseMenu')}</>}
          </button>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
            {session && <BillingBanner session={session} />}
            {tenant?.is_demo && (
              <div className="mb-5">
                <Alert tone="info">{t('dashboard.demoBanner')}</Alert>
              </div>
            )}
            {SETTINGS_PAGES.some((p) => pathname === p || pathname === `${p}/`) && <SettingsBackLink />}
            <Outlet />
          </div>
        </main>
      </div>

      {/* Phones and tablets: app-style bottom tabs */}
      <nav aria-label={t('dashboard.nav.label')} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <ul className="flex">
          {tabs.map((i) => {
            const { to, label, icon: Icon, badge: n } = i;
            const active = isActive(i);
            return (
              <li key={to} className="min-w-0 flex-1">
                <Link to={to} aria-current={active ? 'page' : undefined} className={`flex h-16 flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-semibold ${active ? 'text-ink' : 'text-muted'}`}>
                  <span className={`relative flex h-8 w-12 items-center justify-center rounded-full ${active ? 'bg-ink/10' : ''}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {!!n && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{n}</span>}
                  </span>
                  <span className="max-w-full truncate">{label}</span>
                </Link>
              </li>
            );
          })}
          {overflow.length > 0 && (
            <li className="min-w-0 flex-1">
              <button type="button" onClick={() => setMore(true)} aria-expanded={more} className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold ${overflow.some(isActive) ? 'text-ink' : 'text-muted'}`}>
                <span className="relative flex h-8 w-12 items-center justify-center rounded-full">
                  <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                  {overflow.some((o) => o.badge) && <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-brand" aria-hidden="true" />}
                </span>
                <span className="max-w-full truncate">{t('dashboard.nav.more')}</span>
              </button>
            </li>
          )}
        </ul>
      </nav>
      <Dialog open={more} onClose={() => setMore(false)} title={t('dashboard.nav.more')}>
        <div className="space-y-4">
          {overflowGroups.map((g) => (
            <div key={g.key}>
              {heading(g.key) && <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{t(`dashboard.groups.${g.key}`)}</p>}
              <ul className="grid grid-cols-2 gap-2">
                {g.items.map((i) => {
                  const { to, label, icon: Icon, badge: n } = i;
                  const active = isActive(i);
                  return (
                    <li key={to}>
                      <button type="button" onClick={() => navigate(to)} aria-current={active ? 'page' : undefined} className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 text-start font-semibold ${active ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
                        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" /> <span className="truncate">{label}</span>
                        {badge(n)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Dialog>
      <CommandPalette open={finding} onClose={() => setFinding(false)} access={access} />
    </div>
  );
}
