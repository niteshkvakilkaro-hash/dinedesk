import { describe, expect, it } from 'vitest';
import { resolveSurface } from './host';

// PLATFORM_DOMAIN defaults to "localhost" in tests.
describe('resolveSurface', () => {
  it('treats the platform domain and app./www. hosts as the platform app', () => {
    for (const host of ['localhost', 'app.localhost', 'www.localhost', '127.0.0.1']) {
      expect(resolveSurface(host)).toEqual({ kind: 'platform' });
    }
  });

  it('maps a single-level subdomain to a tenant slug', () => {
    expect(resolveSurface('haveli-demo.localhost')).toEqual({ kind: 'tenant', host: 'haveli-demo.localhost', slug: 'haveli-demo' });
    expect(resolveSurface('Cafe-Sol.LOCALHOST')).toMatchObject({ kind: 'tenant', slug: 'cafe-sol' });
  });

  it('treats nested subdomains and other hosts as custom domains (resolved by the API)', () => {
    expect(resolveSurface('a.b.localhost')).toEqual({ kind: 'tenant', host: 'a.b.localhost', slug: null });
    expect(resolveSurface('www.myrestaurant.in')).toEqual({ kind: 'tenant', host: 'www.myrestaurant.in', slug: null });
  });
});
