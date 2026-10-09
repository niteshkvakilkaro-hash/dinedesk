import { NavLink, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Building2, LayoutDashboard, LogOut, Users } from 'lucide-react';
import { useCan, useSession, useSignOut } from '@/hooks/useSession';
import { Alert, DemoBadge } from '@/components/ui';
import { LanguageToggle, Logo } from '@/components/Brand';

export default function DashboardLayout() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const signOut = useSignOut();
  const canStaff = useCan('staff.manage');
  const canBusiness = useCan('business.manage');
  const tenant = session?.tenant;

  const nav = [
    { to: '/dashboard', label: t('dashboard.nav.overview'), icon: LayoutDashboard, end: true, show: true },
    { to: '/dashboard/team', label: t('dashboard.nav.team'), icon: Users, show: canStaff },
    { to: '/dashboard/business', label: t('dashboard.nav.business'), icon: Building2, show: canBusiness },
  ].filter((n) => n.show);

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
        <nav aria-label="Dashboard" className="mx-auto hidden max-w-6xl gap-1 px-4 sm:px-6 md:flex">
          {nav.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `relative px-3 py-3 text-sm font-semibold ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`}>
              {({ isActive }) => (
                <>
                  {label}
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
          {nav.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink to={to} end={end} className={({ isActive }) => `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${isActive ? 'text-ink' : 'text-muted'}`}>
                {({ isActive }) => (
                  <>
                    <span className={`flex h-8 w-14 items-center justify-center rounded-full ${isActive ? 'bg-ink/10' : ''}`}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
