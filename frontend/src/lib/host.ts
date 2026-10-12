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

export function resolveSurface(hostname = window.location.hostname): Surface {
  const host = hostname.toLowerCase();
  if (PLATFORM_HOSTS.has(host)) return { kind: 'platform' };

  const suffix = `.${PLATFORM_DOMAIN}`;
  if (host.endsWith(suffix)) {
    const slug = host.slice(0, -suffix.length);
    // Only single-level subdomains are tenants (a.b.localhost is not).
    if (slug && !slug.includes('.')) return { kind: 'tenant', host, slug };
  }
  // Anything else is treated as a tenant's custom domain.
  return { kind: 'tenant', host, slug: null };
}

/** Public URL of a tenant's site, e.g. http://haveli.localhost:5173 */
export function tenantSiteUrl(slug: string) {
  // Pre-rendering at build time has no window: use the public https address.
  if (typeof window === 'undefined') return `https://${slug}.${PLATFORM_DOMAIN}`;
  const { protocol, port } = window.location;
  return `${protocol}//${slug}.${PLATFORM_DOMAIN}${port ? `:${port}` : ''}`;
}

/** URL of the platform app (where owners sign in), from any surface. */
export function platformUrl(path = '/') {
  const { protocol, port } = window.location;
  return `${protocol}//${PLATFORM_DOMAIN}${port ? `:${port}` : ''}${path}`;
}
