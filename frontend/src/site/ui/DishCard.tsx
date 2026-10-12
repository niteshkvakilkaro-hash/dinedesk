import { useTranslation } from 'react-i18next';
import { useLocalized } from '../data';
import { FoodTypeMark } from '../components/bits';
import { AddButton } from '../order/AddToCart';
import { useMoney } from '../ordering';
import type { MenuItem } from '../types';
import { useTilt } from './motion';
import { DishImage, Spice } from './primitives';

/** Lowest price a dish can be ordered at ("from ₹240" when it has sizes). */
export function useDishPrice() {
  const { t } = useTranslation();
  const money = useMoney();
  return (item: MenuItem) => {
    const sizes = item.variants.filter((v) => v.is_available);
    if (sizes.length > 1) return t('site.priceFrom', { price: money(Math.min(...sizes.map((v) => Number(v.price)))) });
    return money(sizes[0]?.price ?? item.price);
  };
}

/** "Contains: dairy, nuts" from what the restaurant has listed. */
export function Allergens({ item, className = '' }: { item: MenuItem; className?: string }) {
  const { t } = useTranslation();
  if (!item.allergens?.length) return null;
  return <p className={`s-small s-muted ${className}`}>{t('site.contains', { list: item.allergens.map((a) => t(`site.allergen.${a}`)).join(', ') })}</p>;
}

function Tags({ item }: { item: MenuItem }) {
  const { t } = useTranslation();
  const diets = item.diet_tags ?? [];
  if (!item.is_bestseller && !item.is_chefs_special && !diets.length) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {item.is_chefs_special && <span className="s-badge">{t('site.chefsSpecial')}</span>}
      {item.is_bestseller && <span className="s-badge s-badge-outline">{t('site.bestseller')}</span>}
      {diets.map((d) => (
        <span key={d} className="s-badge s-badge-outline">
          {t(`site.diet.${d}`)}
        </span>
      ))}
    </span>
  );
}

/** Photo-first dish card for the home page's signature dishes. */
export function DishCard({ item, index = 0 }: { item: MenuItem; index?: number }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const price = useDishPrice();
  const tilt = useTilt<HTMLElement>();
  const name = l(item, 'name') ?? item.name;
  return (
    <div className="s-reveal s-zoom h-full" style={{ ['--i' as string]: index % 3 }}>
      <article ref={tilt} className="s-card s-card-hover flex h-full flex-col overflow-hidden">
        <DishImage item={item} className="aspect-[4/3] w-full !rounded-none" />
        <div className="flex flex-1 flex-col gap-3 p-5">
          <Tags item={item} />
          <h3 className="s-h3 flex items-start gap-2">
            <FoodTypeMark type={item.food_type} className="mt-1.5" />
            <span>{name}</span>
          </h3>
          {l(item, 'description') && <p className="s-small s-muted line-clamp-2">{l(item, 'description')}</p>}
          <div className="mt-auto flex items-center justify-between gap-3 pt-2">
            <span className="flex items-center gap-2">
              <span className="s-price text-lg">{price(item)}</span>
              <Spice level={item.spice_level} />
            </span>
            {item.is_available ? <AddButton item={item} /> : <span className="s-small s-muted">{t('site.unavailable')}</span>}
          </div>
        </div>
      </article>
    </div>
  );
}

/** Compact menu row: thumbnail, name, description, price and add button. */
export function DishRow({ item, index = 0 }: { item: MenuItem; index?: number }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const price = useDishPrice();
  const name = l(item, 'name') ?? item.name;
  return (
    <li className={`s-reveal flex gap-4 py-5 ${item.is_available ? '' : 'opacity-60'}`} style={{ ['--i' as string]: Math.min(index, 4) }}>
      <DishImage item={item} sizes="112px" className="h-24 w-24 shrink-0 sm:h-28 sm:w-28" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <FoodTypeMark type={item.food_type} className="translate-y-0.5" />
          <h3 className="min-w-0 text-[1.0625rem] font-bold leading-snug">{name}</h3>
          <span className="s-leader hidden sm:block" aria-hidden="true" />
          <span className="s-price ml-auto sm:ml-0">{price(item)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tags item={item} />
          <Spice level={item.spice_level} />
        </div>
        {l(item, 'description') && <p className="s-small s-muted">{l(item, 'description')}</p>}
        <Allergens item={item} />
        <div className="mt-1">{item.is_available ? <AddButton item={item} className="!min-h-10" /> : <span className="s-small font-semibold">{t('site.unavailable')}</span>}</div>
      </div>
    </li>
  );
}
