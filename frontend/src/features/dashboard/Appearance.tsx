import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Moon, Palette, Sun } from 'lucide-react';
import { PALETTES, setAdminTheme, useAdminPalette, type AdminPalette, type AdminTheme } from '@/lib/adminTheme';

/** Sidebar, accent and page colours of each palette, for the little previews. */
const SWATCH: Record<AdminPalette, [string, string, string]> = {
  classic: ['#14110f', '#c2410c', '#fbf8f3'],
  haveli: ['#1f3328', '#e3bf73', '#f6efe3'],
  royal: ['#3e0f18', '#e2b357', '#fbf5f0'],
  ocean: ['#10263b', '#5eead4', '#f3f7fa'],
};

/** Header menu: light / dark and the colour palette of the dashboard (saved on this device). */
export function Appearance({ theme }: { theme: AdminTheme }) {
  const { t } = useTranslation();
  const [palette, setPalette] = useAdminPalette();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button type="button" className="btn-ghost !min-h-10 !px-2.5" aria-expanded={open} aria-haspopup="true" aria-label={t('dashboard.appearance')} title={t('dashboard.appearance')} onClick={() => setOpen(!open)}>
        <Palette className="h-5 w-5" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-line bg-surface p-4 shadow-xl" role="dialog" aria-label={t('dashboard.appearance')}>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">{t('dashboard.mode')}</p>
          <div className="mt-2 flex gap-1 rounded-full bg-ink/5 p-1" role="radiogroup" aria-label={t('dashboard.mode')}>
            {(['light', 'dark'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={theme === m} onClick={() => setAdminTheme(m)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold ${theme === m ? 'bg-surface shadow' : 'text-muted'}`}>
                {m === 'light' ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
                {t(m === 'light' ? 'dashboard.lightMode' : 'dashboard.darkMode')}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted">{t('dashboard.colours')}</p>
          <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('dashboard.colours')}>
            {PALETTES.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={palette === p} onClick={() => setPalette(p)} className={`relative flex flex-col items-start gap-2 rounded-xl border p-2.5 text-left text-sm font-semibold ${palette === p ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink/40'}`}>
                <span className="flex h-8 w-full overflow-hidden rounded-lg ring-1 ring-black/10" aria-hidden="true">
                  <span className="w-1/3" style={{ background: SWATCH[p][0] }} />
                  <span className="flex flex-1 items-center justify-center" style={{ background: SWATCH[p][2] }}>
                    <span className="h-3 w-3 rounded-full" style={{ background: SWATCH[p][1] }} />
                  </span>
                </span>
                {t(`dashboard.palettes.${p}`)}
                {palette === p && <Check className="absolute right-2 top-2 h-4 w-4 rounded-full bg-ink p-0.5 text-paper" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">{t('dashboard.appearanceHint')}</p>
        </div>
      )}
    </div>
  );
}
