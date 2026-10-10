import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { MotionConfig } from 'motion/react';
import { useAuthStore } from '@/stores/auth';
import { useSession } from '@/hooks/useSession';
import { Spinner, Toaster } from '@/components/ui';

const Landing = lazy(() => import('@/features/marketing/Landing'));
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

/** Sign-up, onboarding, business dashboard and super admin (loaded only on the platform host). */
export default function PlatformApp() {
  return (
    // reducedMotion="user": Motion drops movement for people who ask for less motion.
    <MotionConfig reducedMotion="user">
      <Suspense fallback={<FullPageSpinner />}>
    <Routes>
      <Route index element={<Landing />} />
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
        <Route path="ordering" element={<OrderingSettingsPage />} />
        <Route path="reservations" element={<ReservationsPage />} />
        <Route path="tables" element={<TablesPage />} />
        <Route path="pos" element={<PosPage />} />
        <Route path="day-end" element={<DayEndPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="marketing" element={<MarketingPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="reports" element={<ReportsPage />} />
      </Route>
      {/* Full-screen staff apps: kitchen display and the waiter phone app (PWA). */}
      <Route path="kitchen" element={<Guard need="tenant"><KitchenDisplay /></Guard>} />
      <Route path="waiter/*" element={<Guard need="tenant"><WaiterApp /></Guard>} />
      <Route path="platform" element={<Guard need="platform"><PlatformLayout /></Guard>}>
        <Route index element={<Tenants />} />
        <Route path="tenants/:id" element={<TenantDetail />} />
        <Route path="plans" element={<Plans />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
      </Suspense>
      <Toaster />
    </MotionConfig>
  );
}

