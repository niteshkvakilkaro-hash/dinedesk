import { Link } from 'react-router';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '@/i18n';

export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#14110F" />
      <path d="M9 22h14M11 22c0-5 2.2-9 5-9s5 4 5 9" fill="none" stroke="#F2B544" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="16" cy="10.5" r="1.6" fill="#F2B544" />
    </svg>
  );
}

export function Logo({ to = '/', light = false }: { to?: string; light?: boolean }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 rounded-lg">
      <LogoMark />
      <span className={`text-lg font-extrabold tracking-tight ${light ? 'text-paper' : 'text-ink'}`}>DineDesk</span>
    </Link>
  );
}

/** English / हिन्दी switch. The choice is remembered on this device. */
export function LanguageToggle({ light = false }: { light?: boolean }) {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage ?? 'en';
  return (
    <div className={`inline-flex items-center rounded-full border p-0.5 ${light ? 'border-paper/25' : 'border-line bg-surface'}`} role="group" aria-label={t('common.language')}>
      <Languages className={`mx-1.5 h-4 w-4 ${light ? 'text-paper/70' : 'text-muted'}`} aria-hidden="true" />
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          lang={lang.code}
          aria-pressed={current === lang.code}
          aria-label={lang.label}
          onClick={() => void i18n.changeLanguage(lang.code)}
          className={`min-h-8 rounded-full px-2.5 text-sm font-semibold transition-colors ${
            current === lang.code ? (light ? 'bg-paper text-ink' : 'bg-ink text-paper') : light ? 'text-paper/80 hover:text-paper' : 'text-muted hover:text-ink'
          }`}
        >
          {lang.short}
        </button>
      ))}
    </div>
  );
}
