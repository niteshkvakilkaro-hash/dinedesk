import { useTranslation } from 'react-i18next';
import { formatTime } from '@/lib/format';
import type { OpenStatus } from '@/lib/openStatus';
import { useMotionStore, useReduceMotion } from '@/stores/motion';
import { LANGUAGES } from '@/i18n';
import type { SiteImage } from '../types';

/** Responsive WebP with a blurred placeholder underneath while it loads. */
export function SiteImg({ image, alt, sizes = '100vw', className = '', priority = false, imgClassName = '' }: { image: SiteImage; alt: string; sizes?: string; className?: string; priority?: boolean; imgClassName?: string }) {
  return (
    <span className={`relative block overflow-hidden ${className}`} style={image.placeholder ? { backgroundImage: `url(${image.placeholder})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
      <img
        src={image.src}
        srcSet={image.srcset}
        sizes={sizes}
        width={image.width}
        height={image.height}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        {...(priority ? { fetchpriority: 'high' } : {})}
        className={`h-full w-full object-cover ${imgClassName}`}
      />
    </span>
  );
}

/** Indian food-type mark: green square/dot (veg), brown square/triangle (non-veg), amber (egg). */
export function FoodTypeMark({ type, className = '' }: { type: 'veg' | 'non_veg' | 'egg'; className?: string }) {
  const { t } = useTranslation();
  const color = type === 'veg' ? '#15803d' : type === 'non_veg' ? '#7c2d12' : '#b45309';
  return (
    <svg viewBox="0 0 16 16" className={`inline-block h-4 w-4 shrink-0 ${className}`} role="img" aria-label={t(`site.foodType.${type}`)}>
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#fff" stroke={color} strokeWidth="1.6" />
      {type === 'non_veg' ? <path d="M8 4 12 11.5H4Z" fill={color} /> : <circle cx="8" cy="8" r="3.6" fill={color} />}
    </svg>
  );
}

export function SpiceLevel({ level, className = '' }: { level: number; className?: string }) {
  const { t } = useTranslation();
  if (!level) return null;
  return (
    <span className={className} title={t('site.spice', { count: level })}>
      <span aria-hidden="true">{'🌶'.repeat(Math.min(level, 3))}</span>
      <span className="sr-only">{t('site.spice', { count: level })}</span>
    </span>
  );
}

/** Text for the open/closed badge; each theme styles it its own way. */
export function useOpenLabel(status: OpenStatus | null) {
  const { t } = useTranslation();
  if (!status) return null;
  if (status.holiday) return { open: false, label: t('site.closedToday'), detail: status.holiday.label ?? t('site.holiday') };
  if (status.is_open) return { open: true, label: t('site.openNow'), detail: status.closes_at ? t('site.until', { time: formatTime(status.closes_at) }) : null };
  return { open: false, label: t('site.closedNow'), detail: status.opens_at ? t('site.opensAt', { time: formatTime(status.opens_at) }) : null };
}

export function ReduceMotionToggle({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const user = useMotionStore((s) => s.userReduce);
  const setUser = useMotionStore((s) => s.setUserReduce);
  const effective = useReduceMotion();
  const forcedBySystem = effective && !user;
  return (
    <button type="button" className={className} aria-pressed={effective} disabled={forcedBySystem} onClick={() => setUser(!user)} title={forcedBySystem ? t('site.reduceMotionSystem') : undefined}>
      <span aria-hidden="true" className="inline-block h-3.5 w-6 rounded-full border border-current p-px align-middle">
        <span className={`block h-2.5 w-2.5 rounded-full bg-current transition-transform ${effective ? 'translate-x-2.5' : ''}`} />
      </span>
      <span className="ml-2 align-middle">{t('site.reduceMotion')}</span>
    </button>
  );
}

export function SiteLanguageToggle({ className = '' }: { className?: string }) {
  const { i18n } = useTranslation();
  const next = i18n.language?.startsWith('hi') ? LANGUAGES[0] : LANGUAGES[1];
  return (
    // System font for the glyph: one Devanagari letter shouldn't download a 100 kB web font.
    <button type="button" className={className} onClick={() => void i18n.changeLanguage(next.code)} lang={next.code} aria-label={next.label} style={{ fontFamily: 'system-ui, sans-serif' }}>
      {next.short}
    </button>
  );
}
