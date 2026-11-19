/**
 * One React app serves three surfaces, chosen by the host the visitor is on:
 *
 *  - platform  app.<domain> / <domain> / localhost   → sign up, onboarding,
 *                                                       business dashboard, super admin
 *  - tenant    <slug>.<domain> or a custom domain     → that business's public website
 *
 * In development the platform domain is "localhost", so a business with the
 * subdomain "haveli" is at http://haveli.localhost:5173.
 */

export const PLATFORM_DOMAIN = (import.meta.env.VITE_PLATFORM_DOMAIN || 'localhost').toLowerCase();

const PLATFORM_HOSTS = new Set([PLATFORM_DOMAIN, `app.${PLATFORM_DOMAIN}`, `www.${PLATFORM_DOMAIN}`, '127.0.0.1']);

export type Surface = { kind: 'platform' } | { kind: 'tenant'; host: string; slug: string | null };

/**
 * Business websites at <domain>/s/<slug> instead of <slug>.<domain>, for hosting without wildcard
 * subdomains (VITE_SITE_PATHS=true). The site then runs under the /s/<slug> router basename and
 * still names its business as <slug>.<domain> to the API, so the backend needs no changes.
 */
export const SITE_PATHS = import.meta.env.VITE_SITE_PATHS === 'true';
const PATH_SITE = /^\/s\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?=\/|$)/;

export function resolveSurface(hostname = window.location.hostname, pathname = window.location.pathname, paths = SITE_PATHS): Surface {
  const host = hostname.toLowerCase();
  // A bare IP address (a phone on the same Wi-Fi reaching a dev machine) is never a business domain.
  if (PLATFORM_HOSTS.has(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const site = paths ? PATH_SITE.exec(pathname) : null;
    return site ? { kind: 'tenant', host: `${site[1]}.${PLATFORM_DOMAIN}`, slug: site[1] } : { kind: 'platform' };
  }

  const suffix = `.${PLATFORM_DOMAIN}`;
  if (host.endsWith(suffix)) {
    const slug = host.slice(0, -suffix.length);
    // Only single-level subdomains are tenants (a.b.localhost is not).
    if (slug && !slug.includes('.')) return { kind: 'tenant', host, slug };
  }
  // Anything else is treated as a tenant's custom domain.
  return { kind: 'tenant', host, slug: null };
}

/** Router basename of a business website served at /s/<slug> (undefined everywhere else). */
export function siteBasename(pathname = window.location.pathname, paths = SITE_PATHS): string | undefined {
  const site = paths ? PATH_SITE.exec(pathname) : null;
  return site && PLATFORM_HOSTS.has(window.location.hostname.toLowerCase()) ? site[0] : undefined;
}

/** The business host this page belongs to, as the API knows it (X-Tenant-Host), and as the key for carts and saved orders. */
export function siteHost(): string {
  if (typeof window === 'undefined') return 'x';
  const surface = resolveSurface();
  return surface.kind === 'tenant' && siteBasename() ? surface.host : window.location.host;
}

/** Public URL of a tenant's site, e.g. http://haveli.localhost:5173 (or https://<domain>/s/haveli with VITE_SITE_PATHS). */
export function tenantSiteUrl(slug: string) {
  // Pre-rendering at build time has no window: use the public https address.
  if (typeof window === 'undefined') return SITE_PATHS ? `https://${PLATFORM_DOMAIN}/s/${slug}` : `https://${slug}.${PLATFORM_DOMAIN}`;
  const { protocol, port } = window.location;
  if (SITE_PATHS) return `${protocol}//${PLATFORM_DOMAIN}${port ? `:${port}` : ''}/s/${slug}`;
  return `${protocol}//${slug}.${PLATFORM_DOMAIN}${port ? `:${port}` : ''}`;
}

/** URL of the platform app (where owners sign in), from any surface. */
export function platformUrl(path = '/') {
  const { protocol, port } = window.location;
  return `${protocol}//${PLATFORM_DOMAIN}${port ? `:${port}` : ''}${path}`;
}
