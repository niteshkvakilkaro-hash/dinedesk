import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Mail, MapPin, MessageCircle, Phone, PlayCircle, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { DAYS } from '@/components/HoursEditor';
import { formatTime } from '@/lib/format';
import { languageCode } from '@/i18n/locale';
import { mapHref, telHref, useLocalized, whatsappHref } from '../data';
import { DIETS, type Diet, type GalleryItem, type MenuCategory, type SectionKey, type SiteData } from '../types';
import type { OpenStatus } from '@/lib/openStatus';
import { SiteImg } from './bits';

/** Home sections in the owner's order, minus hidden ones and ones with nothing to show. */
export function useHomeSections(site: SiteData): SectionKey[] {
  return site.theme.sections
    .filter((s) => s.visible)
    .map((s) => s.key)
    .filter((key) => {
      if (key === 'gallery') return site.has_gallery;
      if (key === 'specials' || key === 'menu_preview') return site.has_menu;
      if (key === 'hours') return !!site.opening_hours;
      return true;
    });
}

export function HoursTable({ site, status, className = '', rowClassName = '', todayClassName = 'font-bold' }: { site: SiteData; status: OpenStatus | null; className?: string; rowClassName?: string; todayClassName?: string }) {
  const { t } = useTranslation();
  if (!site.opening_hours) return null;
  return (
    <div className={className}>
      <dl>
        {DAYS.map((d) => {
          const h = site.opening_hours![d];
          const today = status?.today === d;
          return (
            <div key={d} className={`flex justify-between gap-4 ${rowClassName} ${today ? todayClassName : ''}`}>
              <dt>
                {t(`days.${d}`)}
                {today && <span className="sr-only"> ({t('site.today')})</span>}
              </dt>
              <dd className="tabular-nums">{h.closed ? t('onboarding.closed') : `${formatTime(h.open)} – ${formatTime(h.close)}`}</dd>
            </div>
          );
        })}
      </dl>
      {site.holidays.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold">{t('site.holidaysTitle')}</p>
          <ul className="mt-1 text-sm">
            {site.holidays.slice(0, 5).map((h) => (
              <li key={h.date}>
                {new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', weekday: 'short' }).format(new Date(`${h.date}T12:00:00`))}
                {h.label && ` · ${h.label}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Real contact details only; rows the owner left empty are simply not shown. */
export function ContactList({ site, className = '', itemClassName = '', iconClassName = 'h-5 w-5' }: { site: SiteData; className?: string; itemClassName?: string; iconClassName?: string }) {
  const { t } = useTranslation();
  const c = site.content.contact;
  const s = site.content.socials;
  const rows = [
    { key: 'address', icon: MapPin, label: [c.address, site.city].filter(Boolean).join(', '), href: mapHref(site), cta: t('site.directions'), external: true },
    c.phone && { key: 'phone', icon: Phone, label: c.phone, href: telHref(c.phone), cta: t('site.call') },
    c.whatsapp && { key: 'whatsapp', icon: MessageCircle, label: c.whatsapp, href: whatsappHref(c.whatsapp, t('site.whatsappHello', { name: site.name })), cta: 'WhatsApp', external: true },
    c.email && { key: 'email', icon: Mail, label: c.email, href: `mailto:${c.email}`, cta: t('site.email') },
    s.instagram && { key: 'instagram', icon: Globe, label: 'Instagram', href: s.instagram, cta: 'Instagram', external: true },
    s.facebook && { key: 'facebook', icon: Globe, label: 'Facebook', href: s.facebook, cta: 'Facebook', external: true },
    s.youtube && { key: 'youtube', icon: PlayCircle, label: 'YouTube', href: s.youtube, cta: 'YouTube', external: true },
  ].filter(Boolean) as { key: string; icon: typeof MapPin; label: string; href: string; cta: string; external?: boolean }[];

  return (
    <ul className={className}>
      {rows.map(({ key, icon: Icon, label, href, cta, external }) => (
        <li key={key}>
          <a href={href} className={itemClassName} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            <Icon className={`shrink-0 ${iconClassName}`} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block break-words">{label || cta}</span>
              <span className="block text-xs opacity-80">
                {cta}
                {external && <span className="sr-only"> ({t('common.opensInNewTab')})</span>}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Search + veg-only filter for menu pages (searches English, Hindi and the visitor's language). */
export function useMenuFilter(menu: MenuCategory[] | undefined) {
  const { i18n } = useTranslation();
  const lang = languageCode(i18n.language);
  const [vegOnly, setVegOnly] = useState(false);
  const [search, setSearch] = useState('');
  // Dishes must carry every chosen diet label and none of the allergens to avoid.
  const [diets, setDiets] = useState<Diet[]>([]);
  const [avoid, setAvoid] = useState<string[]>([]);
  const all = useMemo(() => (menu ?? []).flatMap((c) => c.items), [menu]);
  // Only offer the filters this menu can answer.
  const availableDiets = useMemo(() => DIETS.filter((d) => all.some((i) => i.diet_tags?.includes(d))), [all]);
  const availableAllergens = useMemo(() => [...new Set(all.flatMap((i) => i.allergens ?? []))].sort(), [all]);
  const categories = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (i: MenuCategory['items'][number]) =>
      !q || [i.name, i.name_hi, i.description, i.description_hi, i.translations?.[lang]?.name, i.translations?.[lang]?.description].some((v) => v?.toLowerCase().includes(q));
    const fits = (i: MenuCategory['items'][number]) =>
      diets.every((d) => i.diet_tags?.includes(d)) && !avoid.some((a) => i.allergens?.includes(a));
    return (menu ?? [])
      .map((c) => ({ ...c, items: c.items.filter((i) => (!vegOnly || i.food_type === 'veg') && fits(i) && matches(i)) }))
      .filter((c) => c.items.length > 0);
  }, [menu, vegOnly, search, diets, avoid, lang]);
  const hasDemo = (menu ?? []).some((c) => c.is_demo || c.items.some((i) => i.is_demo));
  const filterCount = diets.length + avoid.length;
  const clearFilters = () => {
    setDiets([]);
    setAvoid([]);
    setVegOnly(false);
  };
  return { categories, vegOnly, setVegOnly, search, setSearch, hasDemo, diets, setDiets, avoid, setAvoid, availableDiets, availableAllergens, filterCount, clearFilters };
}

/** Menu search box; each theme passes its own input classes. */
export function MenuSearch({ value, onChange, className = '' }: { value: string; onChange: (v: string) => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('site.searchMenu')}
      aria-label={t('site.searchMenu')}
      className={className}
    />
  );
}

/** Accessible full-screen photo viewer: Esc closes, arrows move, focus returns to the thumbnail. */
export function Lightbox({ items, index, onClose, onIndex, className = '' }: { items: GalleryItem[]; index: number | null; onClose: () => void; onIndex: (i: number) => void; className?: string }) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const open = index !== null && !!items[index];

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex(((index ?? 0) + 1) % items.length);
      if (e.key === 'ArrowLeft') onIndex(((index ?? 0) - 1 + items.length) % items.length);
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, index, items.length, onClose, onIndex]);

  if (!open) return null;
  const item = items[index!];
  return (
    <div role="dialog" aria-modal="true" aria-label={item.alt_text} className={`fixed inset-0 z-[80] flex flex-col bg-black/90 text-white ${className}`} onClick={onClose}>
      <div className="flex items-center justify-between p-3">
        <span className="text-sm tabular-nums">
          {index! + 1} / {items.length}
        </span>
        <button ref={closeRef} type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label={t('common.close')}>
          <X className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16" onClick={(e) => e.stopPropagation()}>
        {item.image && <SiteImg image={item.image} alt={item.alt_text} sizes="100vw" className="max-h-full w-auto" imgClassName="!h-auto max-h-[78vh] !w-auto max-w-full !object-contain" priority />}
        {items.length > 1 && (
          <>
            <button type="button" onClick={() => onIndex((index! - 1 + items.length) % items.length)} className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 hover:bg-black/70" aria-label={t('site.previousPhoto')}>
              <ChevronLeft className="h-6 w-6" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onIndex((index! + 1) % items.length)} className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 hover:bg-black/70" aria-label={t('site.nextPhoto')}>
              <ChevronRight className="h-6 w-6" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      <p className="p-4 text-center text-sm" onClick={(e) => e.stopPropagation()}>
        {item.caption || item.alt_text}
        {item.is_demo && ` · ${t('common.demo')}`}
      </p>
    </div>
  );
}

/** Gallery category filter shared by every theme. */
export function useGalleryFilter(items: GalleryItem[] | undefined) {
  const [category, setCategory] = useState<'all' | GalleryItem['category']>('all');
  const available = useMemo(() => Array.from(new Set((items ?? []).map((i) => i.category))), [items]);
  const visible = useMemo(() => (items ?? []).filter((i) => category === 'all' || i.category === category), [items, category]);
  return { category, setCategory, available, visible };
}

/** Plain text with paragraphs from line breaks (owner content is plain text, never HTML). */
export function Paragraphs({ text, className = '' }: { text: string | null; className?: string }) {
  if (!text) return null;
  return (
    <>
      {text
        .split(/\n{2,}|\r\n\r\n/)
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className={className}>
            {p}
          </p>
        ))}
    </>
  );
}

export function useStory(site: SiteData) {
  const l = useLocalized();
  return { about: l(site.content, 'about'), tagline: l(site.content, 'tagline') };
}
