import { lazy, Suspense } from 'react';
import { resolveSurface } from '@/lib/host';

// Each surface is its own chunk: a restaurant's website never downloads the dashboard.
const PlatformApp = lazy(() => import('./PlatformApp'));
const SiteApp = lazy(() => import('@/site/SiteApp'));

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
      <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-current border-t-transparent opacity-60" />
    </div>
  );
}

export default function App() {
  const surface = resolveSurface();
  return <Suspense fallback={<Loading />}>{surface.kind === 'platform' ? <PlatformApp /> : <SiteApp />}</Suspense>;
}
