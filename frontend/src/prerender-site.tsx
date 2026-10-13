/**
 * Server-side renderer for business websites (used by scripts/site-server.mjs). Built with
 * `vite build --ssr`, it turns a public page into HTML from the same data the app would load,
 * so the first paint needs no JavaScript. The browser app then takes over (SiteBody → showApp).
 */
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HelmetServerState } from 'react-helmet-async';
import i18n from '@/i18n';
import { getTheme, themeVars } from '@/themes/registry';
import { SiteBody } from '@/site/SiteApp';
import type { SiteData } from '@/site/types';

/** Public pages worth rendering on the server (everything else is personal or a form step). */
export const SSR_PATHS = ['/', '/menu', '/about', '/gallery', '/contact', '/rooms', '/events', '/offers', '/tiffin', '/reserve'];

export interface SiteSsrData { site: SiteData; menu?: unknown; gallery?: unknown; hotel?: unknown }

export async function renderSite(url: string, data: SiteSsrData) {
  await i18n.changeLanguage('en');
  const { site } = data;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  queryClient.setQueryData(['site'], site);
  if (data.menu) queryClient.setQueryData(['site', 'menu'], data.menu);
  if (data.gallery) queryClient.setQueryData(['site', 'gallery'], data.gallery);
  if (data.hotel) queryClient.setQueryData(['site', 'hotel'], data.hotel);

  const def = getTheme(site.theme.key);
  const module = await def.load();
  const style = themeVars(def, { primary: site.theme.primary_color, accent: site.theme.accent_color });
  const helmetContext: { helmet?: HelmetServerState } = {};
  const html = renderToString(
    <QueryClientProvider client={queryClient}>
      <StaticRouter location={url}>
        <SiteBody site={site} def={def} module={module} style={style as React.CSSProperties} reduce={false} helmetContext={helmetContext} />
      </StaticRouter>
    </QueryClientProvider>,
  );
  const h = helmetContext.helmet;
  return {
    html,
    head: h ? { title: h.title.toString(), tags: [h.meta.toString(), h.link.toString(), h.script.toString()].filter(Boolean).join('\n    ') } : null,
  };
}
