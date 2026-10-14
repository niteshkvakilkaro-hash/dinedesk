import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { registerDashboardWorker } from '@/lib/push';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { MotionConfig } from 'motion/react';
import { useAuthStore } from '@/stores/auth';
import { useSession } from '@/hooks/useSession';
import { Spinner, Toaster } from '@/components/ui';
import { captureReferral } from '@/lib/referral';

const Landing = lazy(() => import('@/features/marketing/Landing'));
const MarketingLayout = lazy(() => import('@/features/marketing/MarketingLayout'));
const FeaturePage = lazy(() => import('@/features/marketing/FeaturePage'));
const ThemesPage = lazy(() => import('@/features/marketing/ThemesPage'));
const PricingPage = lazy(() => import('@/features/marketing/PricingPage'));
const SignupPage = lazy(() => import('@/features/auth/AuthPages').then((m) => ({ default: m.SignupPage })));
const LoginPage = lazy(() => import('@/features/auth/AuthPages').then((m) => ({ default: m.LoginPage })));
const OnboardingWizard = lazy(() => import('@/features/onboarding/OnboardingWizard'));
const DashboardLayout = lazy(() => import('@/features/dashboard/DashboardLayout'));
const Overview = lazy(() => import('@/features/dashboard/Overview'));
const Team = lazy(() => import('@/features/dashboard/Team'));
const Business = lazy(() => import('@/features/dashboard/Business'));
const WebsitePage = lazy(() => import('@/features/website/WebsitePage'));
const GalleryPage = lazy(() => import('@/features/website/GalleryPage'));
const OrdersPage = lazy(() => import('@/features/orders/OrdersPage'));
const MenuPage = lazy(() => import('@/features/menu/MenuPage'));
const MenuLanguagesPage = lazy(() => import('@/features/menu/LanguagesPage'));
const OrderingSettingsPage = lazy(() => import('@/features/ordering/OrderingSettingsPage'));
const ReservationsPage = lazy(() => import('@/features/reservations/ReservationsPage'));
const TablesPage = lazy(() => import('@/features/tables/TablesPage'));
const PosPage = lazy(() => import('@/features/pos/PosPage'));
const DayEndPage = lazy(() => import('@/features/pos/DayEndPage'));
const KitchenDisplay = lazy(() => import('@/features/kitchen/KitchenDisplay'));
const CustomersPage = lazy(() => import('@/features/customers/CustomersPage'));
const MarketingPage = lazy(() => import('@/features/marketing/MarketingPage'));
const InventoryPage = lazy(() => import('@/features/inventory/InventoryPage'));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'));
const FinancePage = lazy(() => import('@/features/finance/FinancePage'));
const RotaPage = lazy(() => import('@/features/staff/RotaPage'));
const TiffinPage = lazy(() => import('@/features/tiffin/TiffinPage'));
const HotelPage = lazy(() => import('@/features/hotel/HotelPage'));
const BillingPage = lazy(() => import('@/features/account/BillingPage'));
const BranchesPage = lazy(() => import('@/features/account/BranchesPage'));
const DomainsPage = lazy(() => import('@/features/account/DomainsPage'));
const RevenuePage = lazy(() => import('@/features/platform/Revenue'));
const PlatformSettingsPage = lazy(() => import('@/features/platform/Settings'));
const WaiterApp = lazy(() => import('@/features/waiter/WaiterApp'));
const PlatformLayout = lazy(() => import('@/features/platform/PlatformLayout'));
const Tenants = lazy(() => import('@/features/platform/Tenants'));
const TenantDetail = lazy(() => import('@/features/platform/TenantDetail'));
const Plans = lazy(() => import('@/features/platform/Plans'));

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

type Need = 'guest' | 'onboarding' | 'tenant' | 'platform';

/** Sends people to the right place for where they are in their journey. */
function Guard({ need, children }: { need: Need; children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const { data: session, isLoading, isError } = useSession();
  const location = useLocation();

  if (!token || isError) {
    return need === 'guest' ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (isLoading || !session) return <FullPageSpinner />;

  const home = session.next === 'platform' ? '/platform' : session.next === 'onboarding' ? '/onboarding' : '/dashboard';
  const allowed = { guest: false, onboarding: session.next === 'onboarding', tenant: session.next === 'dashboard', platform: session.next === 'platform' }[need];

  return allowed ? children : <Navigate to={home} replace />;
}

/** ?ref=CODE on any page (marketing or sign-up) is kept for 30 days, until the business is created. */
function ReferralCapture() {
  const { search } = useLocation();
  useEffect(() => {
    if (search) captureReferral(search);
  }, [search]);
  return null;
}

/** Sign-up, onboarding, business dashboard and super admin (loaded only on the platform host). */
export default function PlatformApp() {
  // The dashboard installs like an app (manifest + a push-only service worker); business websites have their own.
  useEffect(() => {
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/admin.webmanifest';
      document.head.appendChild(link);
    }
    if (!document.querySelector('link[rel="apple-touch-icon"]')) {
      const icon = document.createElement('link');
      icon.rel = 'apple-touch-icon';
      icon.href = '/icons/dd-192.png';
      document.head.appendChild(icon);
    }
    void registerDashboardWorker();
  }, []);
  return (
    // reducedMotion="user": Motion drops movement for people who ask for less motion.
    <MotionConfig reducedMotion="user">
      <ReferralCapture />
      <Suspense fallback={<FullPageSpinner />}>
    <Routes>
      {/* DineDesk's own marketing pages */}
      <Route element={<MarketingLayout />}>
        <Route index element={<Landing />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="themes" element={<ThemesPage />} />
        <Route path="features/:slug" element={<FeaturePage />} />
      </Route>
      <Route path="signup" element={<Guard need="guest"><SignupPage /></Guard>} />
      <Route path="login" element={<Guard need="guest"><LoginPage /></Guard>} />
      <Route path="onboarding" element={<Guard need="onboarding"><OnboardingWizard /></Guard>} />
      <Route path="dashboard" element={<Guard need="tenant"><DashboardLayout /></Guard>}>
        <Route index element={<Overview />} />
        <Route path="team" element={<Team />} />
        <Route path="business" element={<Business />} />
        <Route path="website" element={<WebsitePage />} />
        <Route path="gallery" element={<GalleryPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="menu/languages" element={<MenuLanguagesPage />} />
        <Route path="ordering" element={<OrderingSettingsPage />} />
        <Route path="reservations" element={<ReservationsPage />} />
        <Route path="tables" element={<TablesPage />} />
        <Route path="pos" element={<PosPage />} />
        <Route path="day-end" element={<DayEndPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="marketing" element={<MarketingPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="rota" element={<RotaPage />} />
        <Route path="tiffin" element={<TiffinPage />} />
        <Route path="hotel" element={<HotelPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="branches" element={<BranchesPage />} />
        <Route path="domains" element={<DomainsPage />} />
      </Route>
      {/* Full-screen staff apps: kitchen display and the waiter phone app (PWA). */}
      <Route path="kitchen" element={<Guard need="tenant"><KitchenDisplay /></Guard>} />
      <Route path="waiter/*" element={<Guard need="tenant"><WaiterApp /></Guard>} />
      <Route path="platform" element={<Guard need="platform"><PlatformLayout /></Guard>}>
        <Route index element={<Tenants />} />
        <Route path="tenants/:id" element={<TenantDetail />} />
        <Route path="plans" element={<Plans />} />
        <Route path="revenue" element={<RevenuePage />} />
        <Route path="settings" element={<PlatformSettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
      </Suspense>
      <Toaster />
    </MotionConfig>
  );
}

