import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Building2, CalendarDays, ChefHat, Contact, CreditCard, Globe, Globe2, Hotel, Images, Network, LayoutDashboard, LineChart, LogOut, Megaphone, MoreHorizontal, Package, PanelLeftClose, PanelLeftOpen, QrCode, ReceiptText, Settings2, Smartphone, Store, UtensilsCrossed, Users, Wallet, Wifi } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { disconnectLive, useLive, useLiveStatus } from '@/lib/realtime';
import { useCan, useFeature, useSession, useSignOut } from '@/hooks/useSession';
import { Alert, Dialog, DemoBadge, toast } from '@/components/ui';
import { LanguageToggle, Logo } from '@/components/Brand';
import { useAdminTheme } from '@/lib/adminTheme';
import { Appearance } from './Appearance';
import { useOrderAlerts } from '@/features/orders/alerts';
import { useReservationAlerts } from '@/features/reservations/api';
import { useTableAlerts } from '@/features/tables/api';
import { BillingBanner, OutletSwitcher, SupportBar } from './AccountBanners';

export default function DashboardLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: session } = useSession();
  const signOut = useSignOut();
  const canStaff = useCan('staff.manage');
  const canBusiness = useCan('business.manage');
  const canTheme = useCan('theme.manage');
  const canMenu = useCan('menu.manage');
  const canOrders = useCan('orders.view');
  // Every hook runs on every render (no short-circuits), then the flags combine.
  const hasReservations = useFeature('reservations');
  const hasQr = useFeature('qr_ordering');
  const canManageReservations = useCan('reservations.manage');
  const canRunTables = useCan('tables.manage');
  const canSetupTables = useCan('tables.setup');
  const canReservations = canManageReservations && hasReservations;
  const canTables = (canRunTables || canSetupTables) && hasQr;
  const hasPos = useFeature('pos');
  const hasKds = useFeature('kds');
  const canPosPerm = useCan('pos.use');
  const canKitchenPerm = useCan('kot.update');
  const canCreate = useCan('orders.create');
  const canPos = canPosPerm && hasPos;
  const canCustomers = useCan('customers.view');
  const canMarketingPerm = useCan('marketing.manage');
  const hasCoupons = useFeature('coupons');
  const hasLoyaltyPlan = useFeature('loyalty');
  const canInventoryPerm = useCan('inventory.manage');
  const hasInventory = useFeature('inventory');
  const canReports = useCan('reports.view');
  const hasHotel = useFeature('hotel');
  const canDesk = useCan('rooms.manage');
  const canBilling = useCan('billing.manage');
  const hasBranches = useFeature('multi_branch');
  const canHousekeeping = useCan('housekeeping.update');
  const canRoomSetup = useCan('rooms.setup');
  const canKitchen = canKitchenPerm && hasKds;

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
  // Keep the current page visible in a long sidebar.
  const sideNav = useRef<HTMLElement>(null);
  useEffect(() => {
    sideNav.current?.querySelector('a[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
  }, [pathname, collapsed]);

  type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; show: boolean; end?: boolean; badge?: number };
  const groups: { key: string; items: NavItem[] }[] = [
    {
      key: 'daily',
      items: [
        { to: '/dashboard', label: t('dashboard.nav.overview'), icon: LayoutDashboard, end: true, show: true },
        { to: '/dashboard/orders', label: t('dashboard.nav.orders'), icon: ReceiptText, show: canOrders, badge: pending },
        { to: '/dashboard/reservations', label: t('dashboard.nav.reservations'), icon: CalendarDays, show: canReservations, badge: bookings?.pending ?? 0 },
        { to: '/dashboard/tables', label: t('dashboard.nav.tables'), icon: QrCode, show: canTables, badge: tableFeed?.open ?? 0 },
        { to: '/dashboard/pos', label: t('dashboard.nav.pos'), icon: Store, show: canPos },
        { to: '/kitchen', label: t('dashboard.nav.kitchen'), icon: ChefHat, show: canKitchen },
        { to: '/waiter/', label: t('dashboard.nav.waiter'), icon: Smartphone, show: canRunTables && canCreate && hasQr && !canPosPerm },
      ],
    },
    {
      key: 'menuHotel',
      items: [
        { to: '/dashboard/menu', label: t('dashboard.nav.menu'), icon: UtensilsCrossed, show: canMenu },
        { to: '/dashboard/hotel', label: t('dashboard.nav.hotel'), icon: Hotel, show: hasHotel && (canDesk || canHousekeeping || canRoomSetup) },
      ],
    },
    {
      key: 'grow',
      items: [
        { to: '/dashboard/customers', label: t('dashboard.nav.customers'), icon: Contact, show: canCustomers },
        { to: '/dashboard/marketing', label: t('dashboard.nav.marketing'), icon: Megaphone, show: canMarketingPerm && (hasCoupons || hasLoyaltyPlan) },
        { to: '/dashboard/inventory', label: t('dashboard.nav.inventory'), icon: Package, show: canInventoryPerm && hasInventory },
        { to: '/dashboard/reports', label: t('dashboard.nav.reports'), icon: LineChart, show: canReports },
        { to: '/dashboard/finance', label: t('dashboard.nav.finance'), icon: Wallet, show: canReports },
      ],
    },
    {
      key: 'website',
      items: [
        { to: '/dashboard/website', label: t('dashboard.nav.website'), icon: Globe, show: canTheme },
        { to: '/dashboard/gallery', label: t('dashboard.nav.gallery'), icon: Images, show: canTheme },
        { to: '/dashboard/domains', label: t('dashboard.nav.domains'), icon: Globe2, show: canBusiness },
      ],
    },
    {
      key: 'settings',
      items: [
        { to: '/dashboard/ordering', label: t('dashboard.nav.ordering'), icon: Settings2, show: canBusiness },
        { to: '/dashboard/team', label: t('dashboard.nav.team'), icon: Users, show: canStaff },
        { to: '/dashboard/business', label: t('dashboard.nav.business'), icon: Building2, show: canBusiness },
        { to: '/dashboard/branches', label: t('dashboard.nav.branches'), icon: Network, show: canBusiness && (hasBranches || (session?.branches.length ?? 0) > 1) },
        { to: '/dashboard/billing', label: t('dashboard.nav.billing'), icon: CreditCard, show: canBilling || canBusiness },
      ],
    },
  ]
    .map((g) => ({ ...g, items: g.items.filter((i) => i.show) }))
    .filter((g) => g.items.length > 0);
  const nav = groups.flatMap((g) => g.items);
  // Phones and tablets: the first four as tabs, the rest (grouped) under "More".
  const tabs = nav.length > 5 ? nav.slice(0, 4) : nav;
  const tabSet = new Set(tabs.map((n) => n.to));
  const overflowGroups = groups.map((g) => ({ ...g, items: g.items.filter((i) => !tabSet.has(i.to)) })).filter((g) => g.items.length > 0);
  const overflow = overflowGroups.flatMap((g) => g.items);
  // Only one group (e.g. kitchen or housekeeping staff): no group headings.
  const showHeadings = groups.length > 1;

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
            <Logo to="/dashboard" />
            {tenant && (
              <span className="hidden min-w-0 items-center gap-2 border-l border-line pl-3 sm:flex">
                <span className="truncate font-semibold">{tenant.name}</span>
                {tenant.is_demo && <DemoBadge />}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {session && <OutletSwitcher session={session} />}
            {live && (
              <span className="hidden items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-xs font-bold text-success sm:inline-flex" title={t('dashboard.liveHint')}>
                <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> {t('kds.live')}
              </span>
            )}
            <Appearance theme={theme} />
            <LanguageToggle />
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
          <nav ref={sideNav} aria-label={t('dashboard.nav.label')} className="flex-1 overflow-y-auto px-3 py-4">
            {groups.map((g) => (
              <div key={g.key} className="mb-3 last:mb-0">
                {showHeadings && !collapsed && <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-side-heading">{t(`dashboard.groups.${g.key}`)}</p>}
                {showHeadings && collapsed && <div className="mx-3 mb-2 border-t border-side-line" aria-hidden="true" />}
                <ul className="space-y-0.5">
                  {g.items.map(({ to, label, icon: Icon, end, badge: n }) => (
                    <li key={to}>
                      <NavLink
                        to={to}
                        end={end}
                        title={collapsed ? label : undefined}
                        aria-label={collapsed ? label : undefined}
                        className={({ isActive }) => `relative flex min-h-9 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors ${isActive ? 'bg-side-active text-side-active-ink' : 'text-side-muted hover:bg-side-hover hover:text-side-ink'} ${collapsed ? 'justify-center' : ''}`}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                        {!collapsed && <span className="truncate">{label}</span>}
                        {collapsed ? !!n && <span className="absolute right-1.5 top-1 h-2 w-2 rounded-full bg-brand" aria-label={t('orders.pendingCount', { count: n })} /> : badge(n)}
                      </NavLink>
                    </li>
                  ))}
                </ul>
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
            <Outlet />
          </div>
        </main>
      </div>

      {/* Phones and tablets: app-style bottom tabs */}
      <nav aria-label={t('dashboard.nav.label')} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <ul className="flex">
          {tabs.map(({ to, label, icon: Icon, end, badge: n }) => (
            <li key={to} className="flex-1">
              <NavLink to={to} end={end} className={({ isActive }) => `flex h-16 flex-col items-center justify-center gap-1 truncate px-0.5 text-[11px] font-semibold ${isActive ? 'text-ink' : 'text-muted'}`}>
                {({ isActive }) => (
                  <>
                    <span className={`relative flex h-8 w-12 items-center justify-center rounded-full ${isActive ? 'bg-ink/10' : ''}`}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      {!!n && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{n}</span>}
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
          {overflow.length > 0 && (
            <li className="flex-1">
              <button type="button" onClick={() => setMore(true)} aria-expanded={more} className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold ${overflow.some((o) => pathname.startsWith(o.to)) ? 'text-ink' : 'text-muted'}`}>
                <span className="relative flex h-8 w-12 items-center justify-center rounded-full">
                  <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                  {overflow.some((o) => o.badge) && <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-brand" aria-hidden="true" />}
                </span>
                {t('dashboard.nav.more')}
              </button>
            </li>
          )}
        </ul>
      </nav>
      <Dialog open={more} onClose={() => setMore(false)} title={t('dashboard.nav.more')}>
        <div className="space-y-4">
          {overflowGroups.map((g) => (
            <div key={g.key}>
              {showHeadings && <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{t(`dashboard.groups.${g.key}`)}</p>}
              <ul className="grid grid-cols-2 gap-2">
                {g.items.map(({ to, label, icon: Icon, badge: n }) => (
                  <li key={to}>
                    <button type="button" onClick={() => navigate(to)} className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 text-left font-semibold ${pathname.startsWith(to) ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" /> <span className="truncate">{label}</span>
                      {badge(n)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  );
}
