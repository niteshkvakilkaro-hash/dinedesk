import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { useCart } from '@/site/cart';
import { useLocalized, useSite, useSiteMenu } from '@/site/data';
import { useMoney } from '@/site/ordering';
import { FoodTypeMark } from '@/site/components/bits';
import { artFor, FoodArt } from '@/site/components/FoodArt';
import type { MenuItem } from '@/site/types';
import { SPRING } from '../motion';
import { chilliConfetti } from './confetti';

const priceOf = (i: MenuItem) => Number((i.variants.find((v) => v.is_default) ?? i.variants[0])?.price ?? i.price);

/**
 * Street's combo builder: one pick from each of the first three menu sections,
 * added to the cart together. The price is simply the sum (no invented "combo
 * discount"); dishes with sizes use their default size, extras can be added later.
 */
export function ComboBuilder() {
  const { t } = useTranslation();
  const l = useLocalized();
  const money = useMoney();
  const { data: site } = useSite();
  const { data: menu } = useSiteMenu();
  const add = useCart((s) => s.add);
  const setOpen = useCart((s) => s.setOpen);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const sections = (menu ?? []).map((c) => ({ ...c, items: c.items.filter((i) => i.is_available && i.addon_groups.every((g) => g.min_select === 0)) })).filter((c) => c.items.length).slice(0, 3);
  if (!site?.ordering.enabled || sections.length < 2) return null;

  const chosen = sections.map((c) => c.items.find((i) => i.id === picks[c.id])).filter(Boolean) as MenuItem[];
  const total = chosen.reduce((n, i) => n + priceOf(i), 0);

  const addCombo = (e: React.MouseEvent) => {
    for (const i of chosen) {
      const variant = i.variants.find((v) => v.is_default) ?? i.variants[0] ?? null;
      add({
        item_id: i.id, variant_id: variant?.id ?? null, addon_ids: [], quantity: 1, notes: '',
        name: i.name, name_hi: i.name_hi, variant_name: variant?.name ?? null, addon_names: [], unit_price: priceOf(i), food_type: i.food_type, image: i.image?.src ?? null,
      });
    }
    chilliConfetti({ x: e.clientX, y: e.clientY });
    setPicks({});
    setOpen(true);
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="combo-title">
      <h2 id="combo-title" className="street-box inline-block rotate-1 bg-[#7ED9B5] px-4 py-2 text-4xl text-[#141414] sm:text-5xl">
        {t('order.comboTitle')}
      </h2>
      <p className="mt-4 max-w-xl font-bold">{t('order.comboHint')}</p>
      <div className="mt-8 space-y-8">
        {sections.map((c, si) => (
          <fieldset key={c.id}>
            <legend className="font-display text-2xl uppercase">
              {si + 1}. {l(c, 'name')}
            </legend>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-3">
              {c.items.map((i, ii) => {
                const on = picks[c.id] === i.id;
                return (
                  <motion.label
                    key={i.id}
                    className={`street-box-sm relative flex w-36 shrink-0 cursor-pointer flex-col items-center gap-2 p-3 text-center ${on ? 'bg-[#FFCB2E]' : 'bg-white'}`}
                    style={{ rotate: ii % 2 ? 2 : -2 }}
                    whileTap={{ scaleX: 1.08, scaleY: 0.92 }}
                    transition={SPRING}
                  >
                    <input type="radio" name={`combo-${c.id}`} className="sr-only" checked={on} onChange={() => setPicks({ ...picks, [c.id]: i.id })} />
                    {i.image ? <img src={i.image.src} alt="" className="h-20 w-20 rounded-full border-2 border-[#141414] object-cover" /> : (
                      <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#141414] bg-[#FFF1C7]" style={{ ['--art-ink' as string]: '#141414', ['--art-a' as string]: '#FFCB2E', ['--art-b' as string]: '#D7261E' }}>
                        <FoodArt art={artFor(i.name)} className="h-12 w-12" />
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-sm font-bold leading-tight">
                      <FoodTypeMark type={i.food_type} /> {l(i, 'name')}
                    </span>
                    <span className="font-display">{money(priceOf(i))}</span>
                    {on && (
                      <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#141414] bg-[#D7261E] text-white">
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </span>
                    )}
                  </motion.label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="street-box mt-6 flex flex-wrap items-center justify-between gap-4 bg-[#141414] p-4 text-white">
        <p className="font-bold" aria-live="polite">
          {chosen.length ? t('order.comboPicked', { count: chosen.length, total: money(total) }) : t('order.comboEmpty')}
        </p>
        <button type="button" disabled={!chosen.length} onClick={addCombo} className="street-box-sm min-h-12 bg-[#FFCB2E] px-5 font-bold uppercase text-[#141414] disabled:opacity-50">
          {t('order.comboAdd')}
        </button>
      </div>
    </section>
  );
}
