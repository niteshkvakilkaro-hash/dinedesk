/**
 * Build-time renderer for DineDesk's own marketing pages (see scripts/prerender.mjs).
 * Built with `vite build --ssr`, it turns each page into HTML so search engines and slow
 * phones get the content without running the app first. Business websites are not touched.
 */
import { renderToString } from 'react-dom/server';
import { Route, Routes, StaticRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import MarketingLayout from '@/features/marketing/MarketingLayout';
import Landing from '@/features/marketing/Landing';
import FeaturePage from '@/features/marketing/FeaturePage';
import ThemesPage from '@/features/marketing/ThemesPage';
import PricingPage from '@/features/marketing/PricingPage';
import { MARKETING_PAGES } from '@/features/marketing/content';
import { headTags, marketingHead } from '@/features/marketing/seo';

export { MARKETING_PAGES };

/** @param plans the public /plans response, when the API was reachable at build time */
export async function render(url: string, plans?: unknown) {
  await i18n.changeLanguage('en');
  const queryClient = new QueryClient();
  if (plans) queryClient.setQueryData(['plans'], plans);
  const html = renderToString(
    <QueryClientProvider client={queryClient}>
      <StaticRouter location={url}>
        <Routes>
          <Route element={<MarketingLayout />}>
            <Route index element={<Landing />} />
            <Route path="pricing" element={<PricingPage />} />
            <Route path="themes" element={<ThemesPage />} />
            <Route path="features/:slug" element={<FeaturePage />} />
          </Route>
        </Routes>
      </StaticRouter>
    </QueryClientProvider>,
  );
  const head = marketingHead(url, i18n.t);
  return { html, head, tags: headTags(head, 'en') };
}
