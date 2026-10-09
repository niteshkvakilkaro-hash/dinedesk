import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { useLocation } from 'react-router';
import { useSiteGallery, useSiteMenu, whatsappHref } from '../data';
import type { SiteData, SiteImage } from '../types';

/** Floating WhatsApp button — only when the owner has confirmed the number is on WhatsApp. */
export function WhatsAppButton({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const number = site.content.contact.whatsapp; // the API only sends it once confirmed
  if (!number || pathname.startsWith('/checkout')) return null;
  return (
    <a
      href={whatsappHref(number, t('site.whatsappHello', { name: site.name }))}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-[#073b1d] shadow-lg sm:bottom-6 sm:left-6 sm:right-auto"
      aria-label={t('order.whatsapp', { name: site.name })}
    >
      <MessageCircle className="h-7 w-7" aria-hidden="true" />
    </a>
  );
}

/** Attribution for licensed photos on the site (the demo businesses use credited Wikimedia Commons photos). */
export function PhotoCredits({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const { data: menu } = useSiteMenu();
  const { data: gallery } = useSiteGallery(site.has_gallery);
  const images: (SiteImage | null | undefined)[] = [site.theme.cover, ...(menu ?? []).flatMap((c) => c.items.map((i) => i.image)), ...(gallery ?? []).map((g) => g.image)];
  const credits = new Map<string, NonNullable<SiteImage['credit']>>();
  for (const img of images) if (img?.credit) credits.set(img.credit.source, img.credit);
  if (!credits.size) return null;
  return (
    <details className="bg-t-bg px-4 py-3 text-xs text-t-muted sm:px-8">
      <summary className="mx-auto max-w-6xl cursor-pointer font-semibold">{t('order.photoCredits', { count: credits.size })}</summary>
      <ul className="mx-auto mt-2 max-w-6xl columns-1 gap-6 sm:columns-2 lg:columns-3">
        {[...credits.values()].map((c) => (
          <li key={c.source} className="mb-1 break-inside-avoid">
            <a href={c.source} target="_blank" rel="noopener noreferrer" className="underline">
              {c.author}
            </a>
            {' · '}
            {c.license_url ? (
              <a href={c.license_url} target="_blank" rel="noopener noreferrer" className="underline">
                {c.license}
              </a>
            ) : (
              c.license
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
