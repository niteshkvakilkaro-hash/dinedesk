import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/lib/api';
import { openStatus } from '@/lib/openStatus';
import type { GalleryItem, MenuCategory, MenuItem, SiteData } from './types';

/** Data the server-side renderer already used for this page (window.__ddSsr), so the app starts with it. */
function ssr<T>(key: 'site' | 'menu' | 'gallery' | 'hotel'): T | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window.__ddSsr?.[key] ?? undefined) as T | undefined;
}

const noRetryOn404 = (count: number, e: unknown) => !(e instanceof ApiError && e.status === 404) && count < 1;

export function useSite() {
  return useQuery({
    queryKey: ['site'],
    queryFn: async () => {
      const early = window.__ddSite;
      window.__ddSite = undefined;
      const res = early ? await early : null;
      // On any problem fall back to a normal request, which reports errors properly.
      return res?.data ? (res.data as SiteData) : (await api.get<SiteData>('/site')).data;
    },
    initialData: () => ssr<SiteData>('site'),
    retry: noRetryOn404,
    staleTime: 60_000,
  });
}

export function useSiteMenu() {
  return useQuery({
    queryKey: ['site', 'menu'],
    queryFn: async () => (await api.get<MenuCategory[]>('/site/menu')).data,
    initialData: () => ssr<MenuCategory[]>('menu'),
    retry: noRetryOn404,
    staleTime: 5 * 60_000,
  });
}

export function useSiteGallery(enabled = true) {
  return useQuery({
    queryKey: ['site', 'gallery'],
    queryFn: async () => (await api.get<GalleryItem[]>('/site/gallery')).data,
    initialData: () => ssr<GalleryItem[]>('gallery'),
    retry: noRetryOn404,
    staleTime: 5 * 60_000,
    enabled,
  });
}

/** Open/closed right now, recomputed every 30s in the browser (same rules as the server). */
export function useOpenStatus(site: SiteData) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!site.opening_hours) return null;
  return openStatus(site.opening_hours, site.timezone, site.holidays, now);
}

/** Picks the Hindi field when the visitor reads in Hindi and the owner filled it in. */
export function useLocalized() {
  const { i18n } = useTranslation();
  const hi = i18n.language?.startsWith('hi');
  return <T extends object>(obj: T | null | undefined, field: string): string | null => {
    if (!obj) return null;
    const rec = obj as Record<string, unknown>;
    const value = hi ? (rec[`${field}_hi`] ?? rec[field]) : rec[field];
    return typeof value === 'string' && value !== '' ? value : null;
  };
}

/** Bestsellers and chef's specials first, for "Today's specials" style sections. */
export function featuredItems(menu: MenuCategory[] | undefined, limit = 6): MenuItem[] {
  const items = (menu ?? []).flatMap((c) => c.items).filter((i) => i.is_available);
  const featured = items.filter((i) => i.is_bestseller || i.is_chefs_special);
  return (featured.length ? featured : items).slice(0, limit);
}

export function formatPrice(price: string | number, lang = 'en') {
  return new Intl.NumberFormat(lang.startsWith('hi') ? 'hi-IN' : 'en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(price));
}

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function whatsappHref(phone: string, text?: string) {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function mapHref(site: SiteData) {
  if (site.content.contact.map_url) return site.content.contact.map_url;
  const q = [site.name, site.content.contact.address, site.city].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
