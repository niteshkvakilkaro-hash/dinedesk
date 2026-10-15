import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Building2, IndianRupee, LogOut, Plug, Settings, Tags, X } from 'lucide-react';
import { useSignOut } from '@/hooks/useSession';
import { useAuthStore, type SupportNotice } from '@/stores/auth';
import { LanguageToggle, Logo } from '@/components/Brand';
import { Alert, toast } from '@/components/ui';

/**
 * Back from a support session in this tab (ended, or the hour ran out): open that business again
 * and say what happened.
 */
function SupportReturn() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const notice = useAuthStore((s) => s.supportNotice);
  const [expired, setExpired] = useState<SupportNotice | null>(null);
  useEffect(() => {
    // Read and clear in one go, so it is shown once (effects can run twice in development).
    const n = useAuthStore.getState().supportNotice;
    if (!n) return;
    useAuthStore.getState().clearSupportNotice();
    const notice = n;
    if (notice.kind === 'expired') setExpired(notice);
    else toast.success(t('support.ended'));
    const to = notice.tenantId ? `/platform/tenants/${notice.tenantId}` : null;
    if (to && pathname !== to) navigate(to, { replace: true });
  }, [notice, navigate, pathname, t]);
  if (!expired) return null;
  return (
    <div className="mb-5 flex items-start gap-2">
      <div className="flex-1"><Alert tone="warn">{t('support.expiredNotice', { name: expired.name ?? '' })}</Alert></div>
      <button type="button" className="btn-ghost !min-h-10 !px-2" onClick={() => setExpired(null)} aria-label={t('common.close')}><X className="h-5 w-5" aria-hidden="true" /></button>
    </div>
  );
}

export default function PlatformLayout() {
  const { t } = useTranslation();
  const signOut = useSignOut();
  const nav = [
    { to: '/platform', label: t('platform.nav.tenants'), icon: Building2, end: true },
    { to: '/platform/revenue', label: t('platform.nav.revenue'), icon: IndianRupee },
    { to: '/platform/plans', label: t('platform.nav.plans'), icon: Tags },
    { to: '/platform/integrations', label: t('platform.nav.integrations'), icon: Plug },
    { to: '/platform/settings', label: t('platform.nav.settings'), icon: Settings },
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
        <nav aria-label={t('platform.title')} className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold ${isActive ? 'border-gold text-paper' : 'border-transparent text-paper/70 hover:text-paper'}`}>
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <SupportReturn />
        <Outlet />
      </main>
    </div>
  );
}
