import { Link } from 'react-router';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '@/i18n';
import { languageCode } from '@/i18n/locale';

export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`rounded-lg dark:ring-1 dark:ring-line ${className}`} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#14110F" />
      <path d="M9 22h14M11 22c0-5 2.2-9 5-9s5 4 5 9" fill="none" stroke="#F2B544" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="16" cy="10.5" r="1.6" fill="#F2B544" />
    </svg>
  );
}

/** compact: on narrow phones only the mark shows (the name stays for screen readers). */
export function Logo({ to = '/', light = false, compact = false }: { to?: string; light?: boolean; compact?: boolean }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 rounded-lg">
      <LogoMark />
      <span className={`text-lg font-extrabold tracking-tight ${light ? 'text-paper' : 'text-ink'} ${compact ? 'max-[420px]:sr-only' : ''}`}>DineDesk</span>
    </Link>
  );
}

/**
 * Language menu (each language in its own script). The choice is remembered on this device;
 * onPick also saves it elsewhere (the dashboard saves it on the person's account).
 */
export function LanguageToggle({ light = false, onPick }: { light?: boolean; onPick?: (code: string) => void }) {
  const { i18n, t } = useTranslation();
  const current = languageCode(i18n.resolvedLanguage);
  return (
    <label className={`relative inline-flex min-h-9 items-center gap-1.5 rounded-full border pl-2.5 pr-2 ${light ? 'border-paper/25 text-paper' : 'border-line bg-surface text-ink'}`}>
      <Languages className={`h-4 w-4 shrink-0 ${light ? 'text-paper/70' : 'text-muted'}`} aria-hidden="true" />
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={current}
        onChange={(e) => (onPick ? onPick(e.target.value) : void i18n.changeLanguage(e.target.value))}
        className="min-h-8 cursor-pointer appearance-none bg-transparent pr-1 text-sm font-semibold outline-none"
        style={{ fontFamily: 'system-ui, sans-serif' }}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code} lang={lang.code} className="text-ink">
            {lang.label}
          </option>
        ))}
      </select>
    </label>
  );
}
