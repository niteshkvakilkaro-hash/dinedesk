import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { contrastRatio, HEX_RE } from '@/lib/contrast';
import { useReduceMotion } from '@/stores/motion';
import { getTheme, themeVars } from '@/themes/registry';
import { useSiteMenu } from '../data';
import { FoodTypeMark } from '../components/bits';
import type { SiteData } from '../types';
import { DishCard, DishRow } from './DishCard';
import { InfoCard } from './Hero';
import { Divider, OpenBadge, Spice } from './primitives';

const SWATCHES = ['bg', 'surface', 'surface-2', 'text', 'muted', 'primary', 'on-primary', 'link', 'accent', 'on-accent', 'line'] as const;
const SPACING = [4, 8, 12, 16, 24, 32, 48, 64, 96, 120];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-t-line py-12">
      <h2 className="s-eyebrow mb-6">{title}</h2>
      {children}
    </section>
  );
}

/**
 * /style-guide: the live design system of this site's theme (tokens, type, components,
 * states and motion), with the owner's colour choices applied. Not linked and never indexed.
 */
export default function StyleGuide({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const def = getTheme(site.theme.key);
  const vars = themeVars(def, { primary: site.theme.primary_color, accent: site.theme.accent_color });
  const { data: menu } = useSiteMenu();
  const dish = menu?.flatMap((c) => c.items).find((i) => i.is_available);
  const reduce = useReduceMotion();
  const [replay, setReplay] = useState(0);
  const bg = vars['--t-bg'];
  const ratio = (fg: string, against = bg) => (HEX_RE.test(fg) && HEX_RE.test(against) ? contrastRatio(fg, against).toFixed(2) : null);

  return (
    <div className="s-wrap pb-24 pt-12">
      <p className="s-eyebrow">{def.name}</p>
      <h1 className="s-h1 mt-3">{t('site.sg.title')}</h1>
      <p className="s-lead mt-4 max-w-2xl">{t('site.sg.intro', { name: site.name })}</p>
      <ul className="s-small mt-6 flex flex-wrap gap-2">
        {def.motion.personality.map((p) => (
          <li key={p} className="s-badge s-badge-outline">
            {p}
          </li>
        ))}
      </ul>

      <Block title={t('site.sg.colours')}>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {SWATCHES.map((name) => {
            const value = vars[`--t-${name}`];
            const against = name === 'on-primary' ? vars['--t-primary'] : name === 'on-accent' ? vars['--t-accent'] : bg;
            const r = name === 'bg' || name === 'line' ? null : ratio(value, against);
            return (
              <li key={name} className="s-card overflow-hidden">
                <span className="block h-20" style={{ background: value, boxShadow: 'inset 0 -1px 0 var(--t-line)' }} />
                <span className="block p-3">
                  <code className="s-small block font-bold">--t-{name}</code>
                  <code className="s-small s-muted block">{value}</code>
                  {r && <span className="s-small block">{t('site.sg.contrast', { ratio: r, against: name.startsWith('on-') ? name.slice(3) : 'bg' })}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </Block>

      <Block title={t('site.sg.typography')}>
        <div className="space-y-6">
          <p className="s-display">{site.name}</p>
          <p className="s-h1">H1 · {t('site.signatureTitle')}</p>
          <p className="s-h2">H2 · {t('site.visitTitle')}</p>
          <p className="s-h3">H3 · {t('site.whenOpen')}</p>
          <p className="s-lead max-w-2xl">{t('site.sg.leadSample')}</p>
          <p className="s-body max-w-2xl">{t('site.sg.bodySample')}</p>
          <p className="s-eyebrow">{t('site.fromKitchen')}</p>
          <p className="s-small s-muted">
            display: <code>{def.tokens.fonts.display.split(',')[0]}</code> · body: <code>{def.tokens.fonts.body.split(',')[0]}</code>
            {def.tokens.fonts.mono && (
              <>
                {' '}
                · mono: <code>{def.tokens.fonts.mono.split(',')[0]}</code>
              </>
            )}
          </p>
        </div>
      </Block>

      <Block title={t('site.sg.layout')}>
        <div className="s-grid h-16" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className={`h-full rounded-sm bg-t-primary/15 ${i >= 4 ? 'hidden md:block' : ''}`} />
          ))}
        </div>
        <p className="s-small s-muted mt-3">{t('site.sg.grid')}</p>
        <ul className="mt-8 space-y-2">
          {SPACING.map((s) => (
            <li key={s} className="flex items-center gap-4">
              <code className="s-small w-12 tabular-nums">{s}px</code>
              <span className="h-3 rounded-sm bg-t-accent" style={{ width: s }} />
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-4">
          {(['card', 'btn', 'input'] as const).map((r) => (
            <div key={r} className="flex h-20 w-28 items-end border border-t-line bg-t-surface p-2" style={{ borderRadius: `var(--t-radius-${r})` }}>
              <code className="s-small">
                {r} {vars[`--t-radius-${r}`]}
              </code>
            </div>
          ))}
        </div>
      </Block>

      <Block title={t('site.sg.buttons')}>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="s-btn s-btn-primary">
            {t('site.hero.order')}
          </button>
          <button type="button" className="s-btn s-btn-secondary">
            {t('site.viewMenu')}
          </button>
          <button type="button" className="s-btn s-btn-accent">
            {t('site.reserveTitle')}
          </button>
          <button type="button" className="s-btn s-btn-primary s-btn-sm">
            {t('order.add')}
          </button>
          <button type="button" className="s-btn s-btn-primary" disabled>
            {t('site.sg.disabled')}
          </button>
          <button type="button" className="s-btn s-btn-primary" aria-busy="true">
            <span className="s-spinner" aria-hidden="true" />
            {t('common.loading')}
          </button>
        </div>
        <div className="mt-6 flex flex-wrap gap-3 rounded-[var(--t-radius-card)] bg-t-overlay p-6">
          <span className="s-btn s-btn-glass">{t('site.sg.onPhoto')}</span>
        </div>
        <p className="s-small s-muted mt-4">{t('site.sg.buttonStates')}</p>
      </Block>

      <Block title={t('site.sg.forms')}>
        <div className="grid max-w-3xl gap-6 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">{t('order.name')}</span>
            <input className="s-input" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">{t('order.phone')}</span>
            <input className="s-input" aria-invalid="true" defaultValue="98290" aria-describedby="sg-err" />
            <span id="sg-err" className="mt-1.5 block text-sm font-semibold text-[var(--s-error)]">
              {t('site.sg.errorSample')}
            </span>
          </label>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button type="button" className="s-chip">
            {t('site.allPhotos')}
          </button>
          <button type="button" className="s-chip" aria-pressed="true">
            {t('site.vegOnly')}
          </button>
          <span className="s-badge">{t('site.chefsSpecial')}</span>
          <span className="s-badge s-badge-outline">{t('site.bestseller')}</span>
          <OpenBadge site={site} />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-5">
          {(['veg', 'non_veg', 'egg'] as const).map((f) => (
            <span key={f} className="s-small flex items-center gap-2">
              <FoodTypeMark type={f} /> {t(`site.foodType.${f}`)}
            </span>
          ))}
          <Spice level={2} />
        </div>
      </Block>

      <Block title={t('site.sg.cards')}>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {dish && <DishCard item={dish} />}
          <InfoCard site={site} />
          <div className="s-card p-6">
            <Divider site={site} />
            <p className="s-h3 mt-5">{t('site.reserveTitle')}</p>
            <p className="s-small s-muted mt-2">{t('site.reserveText')}</p>
          </div>
        </div>
        {dish && (
          <ul className="mt-8 max-w-2xl divide-y divide-t-line">
            <DishRow item={dish} />
          </ul>
        )}
      </Block>

      <Block title={t('site.sg.motion')}>
        <dl className="s-small grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          <dt className="font-bold">ease</dt>
          <dd>
            <code>cubic-bezier({def.motion.ease.join(', ')})</code>
          </dd>
          <dt className="font-bold">duration</dt>
          <dd>
            <code>
              {def.motion.duration.fast}s / {def.motion.duration.base}s / {def.motion.duration.slow}s
            </code>
          </dd>
          <dt className="font-bold">stagger</dt>
          <dd>
            <code>{def.motion.stagger * 1000}ms</code>
          </dd>
        </dl>
        <p className="s-small s-muted mt-4">{reduce ? t('site.sg.reduced') : t('site.sg.motionRules')}</p>
        <button type="button" className="s-btn s-btn-secondary s-btn-sm mt-6" onClick={() => setReplay((n) => n + 1)}>
          {t('site.sg.replay')}
        </button>
        <ul key={replay} className="mt-6 grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <li key={i} className="s-reveal s-card s-card-hover flex h-24 items-center justify-center font-bold" style={{ ['--i' as string]: i }}>
              {i + 1}
            </li>
          ))}
        </ul>
      </Block>
    </div>
  );
}
