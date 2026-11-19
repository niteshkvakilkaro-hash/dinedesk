import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageIcon, LayoutGrid, List, Minus, Plus, Search } from 'lucide-react';
import { formatMoney as formatINR } from '@/lib/format';
import { Dialog } from '@/components/ui';
import { FoodTypeMark } from '@/site/components/bits';
import type { MenuCategory, MenuItem } from '@/site/types';
import { lineKey, type TicketLine } from './api';

const price = (v: string) => Number(v);

type View = 'photos' | 'names';
const VIEW_KEY = 'nb_pos_menu_view';
function storedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'names' ? 'names' : 'photos';
  } catch {
    return 'photos';
  }
}

/** Choose size / extras for a dish (staff version of the website's options dialog). */
function OptionsDialog({ item, onClose, onAdd }: { item: MenuItem | null; onClose: () => void; onAdd: (line: Omit<TicketLine, 'key'>) => void }) {
  const { t } = useTranslation();
  const variants = item?.variants.filter((v) => v.is_available) ?? [];
  const [variantId, setVariantId] = useState<number | null>(null);
  const [addonIds, setAddonIds] = useState<number[]>([]);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  if (!item) return null;
  const variant = variants.find((v) => v.id === variantId) ?? variants.find((v) => v.is_default) ?? variants[0] ?? null;
  const addons = item.addon_groups.flatMap((g) => g.addons);
  const unit = (variant ? price(variant.price) : price(item.price)) + addonIds.reduce((n, id) => n + price(addons.find((a) => a.id === id)?.price ?? '0'), 0);
  const toggle = (groupId: number, id: number) => {
    const g = item.addon_groups.find((x) => x.id === groupId)!;
    const inGroup = addonIds.filter((x) => g.addons.some((a) => a.id === x));
    if (addonIds.includes(id)) setAddonIds(addonIds.filter((x) => x !== id));
    else if (g.max_select === 1) setAddonIds([...addonIds.filter((x) => !inGroup.includes(x)), id]);
    else if (g.max_select === null || inGroup.length < g.max_select) setAddonIds([...addonIds, id]);
  };
  const add = () => {
    for (const g of item.addon_groups) {
      if (addonIds.filter((x) => g.addons.some((a) => a.id === x)).length < g.min_select) return setError(t('order.chooseMin', { count: g.min_select, group: g.name }));
    }
    onAdd({
      item_id: item.id, variant_id: variant?.id ?? null, addon_ids: addonIds, quantity: qty, notes: notes.trim(),
      name: item.name, detail: [variant?.name, ...addonIds.map((id) => addons.find((a) => a.id === id)?.name)].filter(Boolean).join(' · '), unit, food_type: item.food_type,
    });
    setAddonIds([]);
    setQty(1);
    setNotes('');
    setVariantId(null);
    setError('');
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={item.name}>
      <div className="space-y-4">
        {variants.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {variants.map((v) => (
              <button key={v.id} type="button" aria-pressed={variant?.id === v.id} onClick={() => setVariantId(v.id)} className={`rounded-xl border px-3 py-3 text-left ${variant?.id === v.id ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
                <span className="block font-semibold">{v.name}</span>
                <span className="text-sm opacity-80">{formatINR(v.price)}</span>
              </button>
            ))}
          </div>
        )}
        {item.addon_groups.map((g) => (
          <fieldset key={g.id}>
            <legend className="mb-2 text-sm font-bold">
              {g.name} <span className="font-normal text-muted">{g.min_select > 0 ? t('order.required', { count: g.min_select }) : t('order.optional')}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {g.addons.filter((a) => a.is_available).map((a) => (
                <button key={a.id} type="button" aria-pressed={addonIds.includes(a.id)} onClick={() => toggle(g.id, a.id)} className={`rounded-full border px-3 py-1.5 text-sm ${addonIds.includes(a.id) ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
                  {a.name} +{formatINR(a.price)}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <input className="field-input" placeholder={t('pos.itemNote')} aria-label={t('pos.itemNote')} maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error && <p className="field-error">{error}</p>}
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-full border border-line">
            <button type="button" className="flex h-11 w-11 items-center justify-center" onClick={() => setQty(Math.max(1, qty - 1))} aria-label={t('order.less')}>
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="w-8 text-center font-bold tabular-nums">{qty}</span>
            <button type="button" className="flex h-11 w-11 items-center justify-center" onClick={() => setQty(qty + 1)} aria-label={t('order.more')}>
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <button type="button" className="btn-primary flex-1" onClick={add} data-autofocus>
            {t('order.addFor', { price: formatINR(unit * qty) })}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** Menu grid for staff: sections, search, tap to add (options open a chooser). */
export function MenuPicker({ menu, onAdd, compact = false }: { menu: MenuCategory[]; onAdd: (line: TicketLine) => void; compact?: boolean }) {
  const { t } = useTranslation();
  const [cat, setCat] = useState<number | 'all'>('all');
  const [q, setQ] = useState('');
  const [choosing, setChoosing] = useState<MenuItem | null>(null);
  // Photos with names, or names only (compact, quickest for regulars); remembered on this device.
  const [view, setView] = useState<View>(storedView);
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* private mode: the choice just isn't kept */
    }
  }, [view]);
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return menu.filter((c) => cat === 'all' || c.id === cat).flatMap((c) => c.items).filter((i) => !s || i.name.toLowerCase().includes(s) || i.name_hi?.includes(s));
  }, [menu, cat, q]);
  const push = (l: Omit<TicketLine, 'key'>) => onAdd({ ...l, key: lineKey(l) });
  const tap = (i: MenuItem) => {
    if (!i.is_available) return;
    if (i.variants.length || i.addon_groups.length) setChoosing(i);
    else push({ item_id: i.id, variant_id: null, addon_ids: [], quantity: 1, notes: '', name: i.name, detail: '', unit: price(i.price), food_type: i.food_type });
  };

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input type="search" className="field-input !pl-9" placeholder={t('pos.search')} aria-label={t('pos.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="flex shrink-0 gap-1 rounded-full bg-ink/5 p-1" role="radiogroup" aria-label={t('pos.viewLabel')}>
          {([['photos', LayoutGrid, t('pos.viewPhotos')], ['names', List, t('pos.viewNames')]] as const).map(([v, Icon, label]) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} title={label} className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors ${view === v ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink'}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className={compact ? 'sr-only' : 'hidden sm:inline'}>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={t('site.categories')}>
        {[{ id: 'all' as const, name: t('reservationsAdmin.all') }, ...menu.map((c) => ({ id: c.id, name: c.name }))].map((c) => (
          <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${cat === c.id ? 'border-ink bg-ink text-paper' : 'border-line bg-surface'}`}>
            {c.name}
          </button>
        ))}
      </div>
      <ul className={`grid gap-2 ${compact ? 'grid-cols-2' : view === 'photos' ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4'}`}>
        {items.map((i) => {
          const priceLabel = i.is_available ? (i.variants.length ? t('site.priceFrom', { price: formatINR(Math.min(...i.variants.map((v) => price(v.price)))) }) : formatINR(i.price)) : t('pos.soldOut');
          return (
            <li key={i.id}>
              {view === 'photos' ? (
                <button
                  type="button"
                  disabled={!i.is_available}
                  onClick={() => tap(i)}
                  className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-surface text-left transition-all hover:border-ink hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="relative block aspect-[4/3] w-full overflow-hidden bg-paper" style={i.image?.placeholder ? { backgroundImage: `url(${i.image.placeholder})`, backgroundSize: 'cover' } : undefined}>
                    {i.image ? (
                      <img src={i.image.src} srcSet={i.image.srcset} sizes="(min-width: 1280px) 220px, 45vw" alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                      // No photo yet: the dish's first letter on a soft tile.
                      <span className="flex h-full w-full items-center justify-center bg-brand-soft text-3xl font-extrabold text-brand-strong" aria-hidden="true">
                        {i.name.trim().charAt(0).toUpperCase() || <ImageIcon className="h-6 w-6" />}
                      </span>
                    )}
                    <span className="absolute left-2 top-2 rounded bg-white/95 p-0.5 shadow-sm">
                      <FoodTypeMark type={i.food_type} />
                    </span>
                  </span>
                  <span className="flex flex-1 flex-col justify-between gap-1 p-2.5">
                    <span className="line-clamp-2 text-sm font-semibold leading-snug">{i.name}</span>
                    <span className="text-xs font-semibold text-muted">{priceLabel}</span>
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!i.is_available}
                  onClick={() => tap(i)}
                  className="flex h-full min-h-20 w-full flex-col justify-between gap-1 rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:border-ink active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="flex items-start gap-1.5 text-sm font-semibold leading-snug">
                    <FoodTypeMark type={i.food_type} className="mt-0.5" />
                    {i.name}
                  </span>
                  <span className="text-xs text-muted">{priceLabel}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <OptionsDialog key={choosing?.id ?? 0} item={choosing} onClose={() => setChoosing(null)} onAdd={push} />
    </div>
  );
}
