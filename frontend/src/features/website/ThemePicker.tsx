import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Monitor, RotateCcw, Smartphone } from 'lucide-react';
import { tenantSiteUrl } from '@/lib/host';
import { contrastWarnings, HEX_RE } from '@/lib/contrast';
import { THEME_KEYS, THEMES } from '@/themes/registry';
import type { ThemeKey } from '@/themes/types';
import type { SectionKey } from '@/site/types';

/** Theme cards: screenshot, name and motion personality. A radio group. */
export function ThemeCards({ value, onChange }: { value: ThemeKey; onChange: (key: ThemeKey) => void }) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={t('website.chooseTheme')} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {THEME_KEYS.map((key) => {
        const def = THEMES[key];
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(key)}
            className={`card overflow-hidden text-left transition-[border-color,box-shadow] ${selected ? '!border-ink ring-2 ring-ink' : 'hover:border-ink/40'}`}
          >
            <span className="relative block aspect-[4/3] overflow-hidden border-b border-line" style={{ background: def.tokens.colors.bg }}>
              <img src={def.preview} alt="" className="h-full w-full object-cover object-top" loading="lazy" width={640} height={480} />
              {selected && (
                <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-paper">
                  <Check className="h-4 w-4" aria-hidden="true" />
                </span>
              )}
            </span>
            <span className="block p-4">
              <span className="flex items-center gap-2">
                <span className="font-bold">{def.name}</span>
                <span className="ml-auto flex gap-1" aria-hidden="true">
                  {[def.tokens.colors.primary, def.tokens.colors.accent, def.tokens.colors.bg].map((c) => (
                    <span key={c} className="h-4 w-4 rounded-full border border-line" style={{ background: c }} />
                  ))}
                </span>
              </span>
              <span className="mt-1 block text-sm text-muted">{t(`website.themeHints.${key}`)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Colour pickers with live contrast warnings (the server runs the same check). */
export function ColorFields({
  theme,
  primary,
  accent,
  onChange,
}: {
  theme: ThemeKey;
  primary: string | null;
  accent: string | null;
  onChange: (next: { primary_color: string | null; accent_color: string | null }) => void;
}) {
  const { t } = useTranslation();
  const tokens = THEMES[theme].tokens;
  const warnings = contrastWarnings({ background: tokens.colors.bg, text: tokens.colors.text, accentRole: tokens.accentRole }, primary, accent);
  const field = (name: 'primary_color' | 'accent_color', value: string | null, fallback: string) => {
    const warning = warnings.find((w) => w.field === name);
    const id = `color-${name}`;
    return (
      <div>
        <label htmlFor={id} className="field-label">
          {t(`website.${name}`)}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={id}
            type="color"
            value={value ?? fallback}
            onChange={(e) => onChange({ primary_color: primary, accent_color: accent, [name]: e.target.value.toUpperCase() })}
            className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-line bg-surface p-1"
            aria-describedby={warning ? `${id}-warn` : `${id}-hint`}
          />
          <input
            type="text"
            inputMode="text"
            aria-label={t('website.hexCode', { field: t(`website.${name}`) })}
            className="field-input !w-28 font-mono uppercase"
            value={value ?? ''}
            placeholder={fallback}
            maxLength={7}
            onChange={(e) => {
              const v = e.target.value.trim();
              onChange({ primary_color: primary, accent_color: accent, [name]: v === '' ? null : HEX_RE.test(v) ? v.toUpperCase() : v });
            }}
          />
          {value && (
            <button type="button" className="btn-ghost !min-h-11 shrink-0 whitespace-nowrap !px-3 text-sm" onClick={() => onChange({ primary_color: primary, accent_color: accent, [name]: null })}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> {t('website.resetColor')}
            </button>
          )}
        </div>
        {warning ? (
          <p id={`${id}-warn`} className="mt-1.5 text-sm font-medium text-warn" role="status">
            {t(`website.contrastWarn.${name}`, { ratio: warning.ratio.toFixed(1), required: warning.required })}
          </p>
        ) : (
          <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
            {t(`website.colorHint.${name}`)}
          </p>
        )}
      </div>
    );
  };
  return (
    <div className="grid gap-5">
      {field('primary_color', primary, tokens.colors.primary)}
      {field('accent_color', accent, tokens.colors.accent)}
    </div>
  );
}

export function validColor(v: string | null) {
  return v === null || HEX_RE.test(v);
}

/** Reorder / hide home page sections with plain buttons (works with keyboard and screen readers). */
export function SectionOrder({ value, onChange }: { value: { key: SectionKey; visible: boolean }[]; onChange: (v: { key: SectionKey; visible: boolean }[]) => void }) {
  const { t } = useTranslation();
  const move = (i: number, d: -1 | 1) => {
    const next = [...value];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <ol className="divide-y divide-line rounded-xl border border-line bg-surface">
      <li className="flex items-center gap-3 px-3 py-2.5 text-muted">
        <span className="w-6 text-center text-sm font-bold">1</span>
        <span className="flex-1 font-semibold">{t('website.sections.hero')}</span>
        <span className="text-xs">{t('website.alwaysFirst')}</span>
      </li>
      {value.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2 px-3 py-1.5">
          <span className="w-6 text-center text-sm font-bold text-muted">{i + 2}</span>
          <span className={`flex-1 font-semibold ${s.visible ? '' : 'text-muted line-through'}`}>{t(`website.sections.${s.key}`)}</span>
          <button type="button" className="btn-ghost !min-h-10 !px-2.5" aria-pressed={!s.visible} onClick={() => onChange(value.map((x, j) => (j === i ? { ...x, visible: !x.visible } : x)))}>
            {s.visible ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
            <span className="sr-only">{t(s.visible ? 'website.hideSection' : 'website.showSection', { section: t(`website.sections.${s.key}`) })}</span>
          </button>
          <button type="button" className="btn-ghost !min-h-10 !px-2.5" disabled={i === 0} onClick={() => move(i, -1)}>
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('website.moveUp', { section: t(`website.sections.${s.key}`) })}</span>
          </button>
          <button type="button" className="btn-ghost !min-h-10 !px-2.5" disabled={i === value.length - 1} onClick={() => move(i, 1)}>
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('website.moveDown', { section: t(`website.sections.${s.key}`) })}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export interface PreviewState {
  theme: ThemeKey;
  primary_color: string | null;
  accent_color: string | null;
  sections?: { key: SectionKey; visible: boolean }[];
}

/**
 * The real website in an iframe (?preview=1), updated live over postMessage
 * as the owner changes theme, colours and sections — before anything is saved.
 */
export function LivePreview({ slug, state, reloadKey = 0 }: { slug: string; state: PreviewState; reloadKey?: number }) {
  const { t } = useTranslation();
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [ready, setReady] = useState(false);
  const [scale, setScale] = useState(0.5);
  const siteUrl = tenantSiteUrl(slug);
  const origin = new URL(siteUrl).origin;
  const width = device === 'desktop' ? 1280 : 375;
  const height = device === 'desktop' ? 800 : 740;
  const [initialTheme] = useState(state.theme);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === origin && e.data?.type === 'dd:preview-ready') setReady(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origin]);

  // A new frame (device switch / reload) announces itself again.
  useEffect(() => setReady(false), [device, reloadKey]);

  useEffect(() => {
    if (!ready) return;
    const valid = (c: string | null) => (c && HEX_RE.test(c) ? c : null);
    frame.current?.contentWindow?.postMessage({ type: 'dd:preview', theme: state.theme, primary_color: valid(state.primary_color), accent_color: valid(state.accent_color), ...(state.sections ? { sections: state.sections } : {}) }, origin);
  }, [ready, state, origin]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-muted">{t('website.livePreview')}</p>
        <div className="flex rounded-full border border-line bg-surface p-0.5" role="group" aria-label={t('website.previewDevice')}>
          {(['desktop', 'mobile'] as const).map((d) => (
            <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${device === d ? 'bg-ink text-paper' : 'text-muted'}`}>
              {d === 'desktop' ? <Monitor className="h-4 w-4" aria-hidden="true" /> : <Smartphone className="h-4 w-4" aria-hidden="true" />}
              {t(`website.${d}`)}
            </button>
          ))}
        </div>
      </div>
      <div ref={box} className="overflow-hidden rounded-xl border border-line bg-paper" style={{ height: height * scale }}>
        <iframe
          key={`${device}-${reloadKey}`}
          ref={frame}
          title={t('website.livePreview')}
          src={`${siteUrl}/?preview=1&preview_theme=${initialTheme}`}
          style={{ width, height, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0 }}
          className={device === 'mobile' ? 'mx-auto' : ''}
        />
      </div>
    </div>
  );
}
