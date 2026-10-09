import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Building2, Globe, Images, LayoutDashboard, LogOut, MoreHorizontal, ReceiptText, Settings2, UtensilsCrossed, Users } from 'lucide-react';
import { useCan, useSession, useSignOut } from '@/hooks/useSession';
import { Alert, Dialog, DemoBadge, toast } from '@/components/ui';
import { LanguageToggle, Logo } from '@/components/Brand';
import { useOrderAlerts } from '@/features/orders/alerts';

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
  const [more, setMore] = useState(false);
  const tenant = session?.tenant;

  // New orders anywhere in the dashboard: chime + a toast that opens Orders.
  const feed = useOrderAlerts(canOrders, (f) => {
    for (const o of f.new) toast.success(t('orders.newToast', { number: o.number, name: o.customer_name }));
  });
  const pending = feed?.counts.pending ?? 0;
  useEffect(() => setMore(false), [pathname]);

  const nav = [
    { to: '/dashboard', label: t('dashboard.nav.overview'), icon: LayoutDashboard, end: true, show: true },
    { to: '/dashboard/orders', label: t('dashboard.nav.orders'), icon: ReceiptText, show: canOrders, badge: pending },
    { to: '/dashboard/menu', label: t('dashboard.nav.menu'), icon: UtensilsCrossed, show: canMenu },
    { to: '/dashboard/website', label: t('dashboard.nav.website'), icon: Globe, show: canTheme },
    { to: '/dashboard/gallery', label: t('dashboard.nav.gallery'), icon: Images, show: canTheme },
    { to: '/dashboard/ordering', label: t('dashboard.nav.ordering'), icon: Settings2, show: canBusiness },
    { to: '/dashboard/team', label: t('dashboard.nav.team'), icon: Users, show: canStaff },
    { to: '/dashboard/business', label: t('dashboard.nav.business'), icon: Building2, show: canBusiness },
  ].filter((n) => n.show);
  // Phones: the first four as tabs, the rest under "More".
  const tabs = nav.length > 5 ? nav.slice(0, 4) : nav;
  const overflow = nav.length > 5 ? nav.slice(4) : [];

  const badge = (n?: number) =>
    n ? (
      <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold leading-5 text-white tabular-nums" aria-label={t('orders.pendingCount', { count: n })}>
        {n}
      </span>
    ) : null;

  return (
    <div className="min-h-screen pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
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
            <LanguageToggle />
            <button type="button" onClick={() => void signOut()} className="btn-ghost !min-h-10 !px-3" aria-label={t('common.signOut')}>
              <LogOut className="h-5 w-5" aria-hidden="true" />
              <span className="hidden sm:inline">{t('common.signOut')}</span>
            </button>
          </div>
        </div>
        <nav aria-label="Dashboard" className="mx-auto hidden max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6 md:flex">
          {nav.map(({ to, label, end, badge: n }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `relative flex items-center whitespace-nowrap px-3 py-3 text-sm font-semibold ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`}>
              {({ isActive }) => (
                <>
                  {label}
                  {badge(n)}
                  {isActive && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {tenant?.status === 'read_only' && (
          <div className="mb-5">
            <Alert tone="warn">{t('dashboard.readOnly')}</Alert>
          </div>
        )}
        {tenant?.is_demo && (
          <div className="mb-5">
            <Alert tone="info">{t('dashboard.demoBanner')}</Alert>
          </div>
        )}
        <Outlet />
      </main>

      {/* Phone: app-style bottom tabs */}
      <nav aria-label="Dashboard" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
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
                <span className="flex h-8 w-12 items-center justify-center rounded-full">
                  <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                </span>
                {t('dashboard.nav.more')}
              </button>
            </li>
          )}
        </ul>
      </nav>
      <Dialog open={more} onClose={() => setMore(false)} title={t('dashboard.nav.more')}>
        <ul className="grid grid-cols-2 gap-2">
          {overflow.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <button type="button" onClick={() => navigate(to)} className={`flex min-h-16 w-full items-center gap-3 rounded-xl border px-4 text-left font-semibold ${pathname.startsWith(to) ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
                <Icon className="h-5 w-5" aria-hidden="true" /> {label}
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
