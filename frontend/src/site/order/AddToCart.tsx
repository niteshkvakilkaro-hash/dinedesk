import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import { cartChoice, lineKey, MAX_QTY, useCart } from '../cart';
import { useLocalized, useSite } from '../data';
import { FoodTypeMark } from '../components/bits';
import type { MenuItem } from '../types';
import { SiteDialog, useSkin } from './skin';
import { useMoney } from '../ordering';
import { useActiveRoom } from '../hotel';
import { orderMode } from './mode';

const priceOf = (v: string) => Number(v);

/** Can this site take orders right now (ordering on and the dish available)? */
export function useCanOrder(item?: MenuItem) {
  const { data: site } = useSite();
  // A hotel guest ordering from their room's QR can order even if the site takes no other orders.
  const room = useActiveRoom(site);
  return (!!orderMode(site) || !!room) && (!item || item.is_available);
}

/** "Add" for a dish: simple dishes go straight in; dishes with options open a chooser. */
export function AddButton({ item, className = '', label }: { item: MenuItem; className?: string; label?: string }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const skin = useSkin();
  const canOrder = useCanOrder(item);
  const [choosing, setChoosing] = useState(false);
  const add = useCart((s) => s.add);
  const lines = useCart((s) => s.lines);
  const setQuantity = useCart((s) => s.setQuantity);
  const hasOptions = item.variants.length > 0 || item.addon_groups.length > 0;
  const simpleKey = lineKey(item.id, null, [], '');
  const inCart = !hasOptions ? lines.find((x) => x.key === simpleKey) : undefined;
  const optionCount = hasOptions ? lines.filter((x) => x.item_id === item.id).reduce((n, x) => n + x.quantity, 0) : 0;

  if (!canOrder) return null;

  const addSimple = (e: React.MouseEvent) => {
    add({
      item_id: item.id, variant_id: null, addon_ids: [], quantity: 1, notes: '',
      name: item.name, name_hi: item.name_hi, translations: item.translations, variant_name: null, addon_names: [], unit_price: priceOf(item.price), food_type: item.food_type, image: item.image?.src ?? null,
    });
    skin.onAdd?.({ x: e.clientX, y: e.clientY });
  };

  if (inCart) {
    return (
      <div className={`inline-flex items-center ${skin.chip} ${className}`} role="group" aria-label={t('order.inCart', { name: l(item, 'name') })}>
        <button type="button" className="flex h-10 w-10 items-center justify-center" onClick={() => setQuantity(simpleKey, inCart.quantity - 1)} aria-label={t('order.decrease', { name: l(item, 'name') })}>
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="min-w-6 text-center font-bold tabular-nums" aria-live="polite">
          {inCart.quantity}
        </span>
        <button type="button" className="flex h-10 w-10 items-center justify-center disabled:opacity-40" disabled={inCart.quantity >= MAX_QTY} onClick={(e) => {
          setQuantity(simpleKey, inCart.quantity + 1);
          skin.onAdd?.({ x: e.clientX, y: e.clientY });
        }} aria-label={t('order.increase', { name: l(item, 'name') })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={hasOptions ? () => setChoosing(true) : addSimple}
        className={`inline-flex min-h-10 items-center gap-1.5 px-4 text-sm ${skin.primary} ${className}`}
        aria-label={t('order.addNamed', { name: l(item, 'name') })}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {label ?? t('order.add')}
        {optionCount > 0 && <span className="ml-1 rounded-full bg-white/25 px-1.5 text-xs tabular-nums">{optionCount}</span>}
      </button>
      {hasOptions && <DishOptions item={item} open={choosing} onClose={() => setChoosing(false)} />}
    </>
  );
}

/** Choose size, extras, quantity and a note for one dish. */
export function DishOptions({ item, open, onClose }: { item: MenuItem; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const skin = useSkin();
  const money = useMoney();
  const add = useCart((s) => s.add);
  const variants = item.variants.filter((v) => v.is_available);
  const [variantId, setVariantId] = useState<number | null>(() => (variants.find((v) => v.is_default) ?? variants[0])?.id ?? null);
  const [addonIds, setAddonIds] = useState<number[]>([]);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const variant = variants.find((v) => v.id === variantId) ?? null;
  const allAddons = useMemo(() => item.addon_groups.flatMap((g) => g.addons), [item.addon_groups]);
  const unit = (variant ? priceOf(variant.price) : priceOf(item.price)) + addonIds.reduce((n, id) => n + priceOf(allAddons.find((a) => a.id === id)?.price ?? '0'), 0);

  const toggle = (groupId: number, addonId: number) => {
    const group = item.addon_groups.find((g) => g.id === groupId)!;
    const inGroup = addonIds.filter((id) => group.addons.some((a) => a.id === id));
    if (addonIds.includes(addonId)) setAddonIds(addonIds.filter((id) => id !== addonId));
    else if (group.max_select === 1) setAddonIds([...addonIds.filter((id) => !inGroup.includes(id)), addonId]);
    else if (group.max_select === null || inGroup.length < group.max_select) setAddonIds([...addonIds, addonId]);
  };

  const submit = (e: React.MouseEvent) => {
    for (const g of item.addon_groups) {
      const n = addonIds.filter((id) => g.addons.some((a) => a.id === id)).length;
      if (n < g.min_select) return setError(t('order.chooseMin', { count: g.min_select, group: l(g, 'name') }));
    }
    add({
      item_id: item.id, variant_id: variantId, addon_ids: addonIds, quantity: qty, notes: notes.trim(),
      name: item.name, name_hi: item.name_hi, translations: item.translations, variant_name: variant?.name ?? null,
      addon_names: addonIds.map((id) => allAddons.find((a) => a.id === id)?.name ?? ''), unit_price: unit, food_type: item.food_type, image: item.image?.src ?? null,
      variant: variant ? cartChoice(variant) : null,
      addons: addonIds.map((id) => allAddons.find((a) => a.id === id)).map((a) => (a ? cartChoice(a) : { name: '', name_hi: null })),
    });
    skin.onAdd?.({ x: e.clientX, y: e.clientY });
    onClose();
    setAddonIds([]);
    setQty(1);
    setNotes('');
    setError('');
  };

  return (
    <SiteDialog
      open={open}
      onClose={onClose}
      title={l(item, 'name') ?? item.name}
      footer={
        <div className="flex items-center gap-3">
          <div className={`inline-flex items-center ${skin.chip}`} role="group" aria-label={t('order.quantity')}>
            <button type="button" className="flex h-11 w-11 items-center justify-center disabled:opacity-40" disabled={qty <= 1} onClick={() => setQty(qty - 1)} aria-label={t('order.less')}>
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="min-w-6 text-center font-bold tabular-nums" aria-live="polite">
              {qty}
            </span>
            <button type="button" className="flex h-11 w-11 items-center justify-center disabled:opacity-40" disabled={qty >= MAX_QTY} onClick={() => setQty(qty + 1)} aria-label={t('order.more')}>
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <button type="button" data-autofocus className={`min-h-12 flex-1 px-4 ${skin.primary}`} onClick={submit}>
            {t('order.addFor', { price: money(unit * qty) })}
          </button>
        </div>
      }
    >
      {item.image && <img src={item.image.src} alt="" className="mb-4 aspect-[16/9] w-full rounded-[inherit] object-cover" />}
      <p className="flex items-center gap-2 text-sm">
        <FoodTypeMark type={item.food_type} />
        {l(item, 'description')}
      </p>
      {!!item.allergens?.length && <p className="mt-2 text-sm opacity-75">{t('site.contains', { list: item.allergens.map((a) => t(`site.allergen.${a}`)).join(', ') })}</p>}
      {error && (
        <p role="alert" className="mt-3 rounded bg-[#fee2e2] px-3 py-2 text-sm font-semibold text-[#991b1b]">
          {error}
        </p>
      )}

      {variants.length > 0 && (
        <fieldset className="mt-5 min-w-0">
          <legend className="font-bold">{t('order.chooseSize')}</legend>
          <div className="mt-2 grid gap-2">
            {variants.map((v) => (
              <label key={v.id} className={`flex min-h-12 cursor-pointer items-center gap-3 px-3 ${skin.chip} has-[:checked]:ring-2 has-[:checked]:ring-[var(--t-primary)]`}>
                <input type="radio" name={`variant-${item.id}`} checked={variantId === v.id} onChange={() => setVariantId(v.id)} className="h-4 w-4 accent-[var(--t-primary)]" />
                <span className="flex-1">{l(v, 'name')}</span>
                <span className="tabular-nums">{money(v.price)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {item.addon_groups.map((g) => {
        const chosen = addonIds.filter((id) => g.addons.some((a) => a.id === id)).length;
        const full = g.max_select !== null && chosen >= g.max_select && g.max_select !== 1;
        return (
          <fieldset key={g.id} className="mt-5 min-w-0">
            <legend className="font-bold">
              {l(g, 'name')}{' '}
              <span className="text-sm font-normal text-t-muted">
                {g.min_select > 0 ? t('order.required', { count: g.min_select }) : t('order.optional')}
                {g.max_select !== null && g.max_select > 1 && ` · ${t('order.upTo', { count: g.max_select })}`}
              </span>
            </legend>
            <div className="mt-2 grid gap-2">
              {g.addons.map((a) => {
                const checked = addonIds.includes(a.id);
                return (
                  <label key={a.id} className={`flex min-h-12 cursor-pointer items-center gap-3 px-3 ${skin.chip} ${!checked && full ? 'opacity-50' : ''}`}>
                    <input
                      type={g.max_select === 1 ? 'radio' : 'checkbox'}
                      name={`group-${g.id}`}
                      checked={checked}
                      disabled={!checked && full}
                      onChange={() => toggle(g.id, a.id)}
                      onClick={(e) => g.max_select === 1 && checked && (e.preventDefault(), toggle(g.id, a.id))}
                      className="h-4 w-4 accent-[var(--t-primary)]"
                    />
                    <FoodTypeMark type={a.food_type} />
                    <span className="flex-1">{l(a, 'name')}</span>
                    <span className="tabular-nums">+{money(a.price)}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <label className="mt-5 block">
        <span className="font-bold">{t('order.note')}</span> <span className="text-sm text-t-muted">({t('order.optional')})</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} placeholder={t('order.notePlaceholder')} className={`mt-2 block min-h-11 w-full px-3 ${skin.input}`} />
      </label>
    </SiteDialog>
  );
}
