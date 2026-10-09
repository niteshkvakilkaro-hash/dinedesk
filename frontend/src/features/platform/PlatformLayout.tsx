import { NavLink, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Building2, LogOut, Tags } from 'lucide-react';
import { useSignOut } from '@/hooks/useSession';
import { LanguageToggle, Logo } from '@/components/Brand';

export default function PlatformLayout() {
  const { t } = useTranslation();
  const signOut = useSignOut();
  const nav = [
    { to: '/platform', label: t('platform.nav.tenants'), icon: Building2, end: true },
    { to: '/platform/plans', label: t('platform.nav.plans'), icon: Tags },
  ];

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 bg-ink text-paper">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo to="/platform" light />
            <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-ink">{t('platform.title')}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle light />
            <button type="button" onClick={() => void signOut()} className="btn !min-h-10 !px-3 text-paper hover:bg-paper/10" aria-label={t('common.signOut')}>
              <LogOut className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
        <nav aria-label={t('platform.title')} className="mx-auto flex max-w-7xl gap-1 px-4 sm:px-6">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold ${isActive ? 'border-gold text-paper' : 'border-transparent text-paper/70 hover:text-paper'}`}>
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
