import type { MenuCategory, MenuItem } from '../types';

/** Category names / slugs that read as "something to finish with": desserts and drinks. */
const SIDE = /dessert|sweet|mithai|ice ?cream|kulfi|drink|beverage|juice|shake|lassi|mocktail|soda|tea|coffee|chai|cold|मिठाई|पेय/i;

/**
 * "Goes well with" for the cart: available dishes not already in it. A dessert or drink comes first
 * when the cart has none, then bestsellers and chef's specials, then dishes from the cart's own
 * categories are skipped in favour of new ones. Simple dishes (no options) go first so one tap adds.
 */
export function pairings(menu: MenuCategory[] | undefined, inCart: number[], limit = 3): MenuItem[] {
  if (!menu?.length || !inCart.length) return [];
  const have = new Set(inCart);
  const isSide = (c: MenuCategory) => SIDE.test(`${c.slug} ${c.name}`);
  const cartCats = new Set(menu.filter((c) => c.items.some((i) => have.has(i.id))).map((c) => c.id));
  const cartHasSide = menu.some((c) => cartCats.has(c.id) && isSide(c));

  const scored: { item: MenuItem; score: number; order: number }[] = [];
  let order = 0;
  for (const c of menu) {
    for (const item of c.items) {
      order++;
      if (!item.is_available || have.has(item.id)) continue;
      let score = 0;
      if (isSide(c) && !cartHasSide) score += 4;
      if (item.is_bestseller || item.is_chefs_special) score += 2;
      if (!cartCats.has(c.id)) score += 1;
      if (item.image) score += 0.5;
      if (item.variants.length === 0 && item.addon_groups.length === 0) score += 0.25;
      scored.push({ item, score, order });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.order - b.order);

  // At most one per category, so the three suggestions are different kinds of dish.
  const out: MenuItem[] = [];
  const used = new Set<number>();
  const catOf = new Map(menu.flatMap((c) => c.items.map((i) => [i.id, c.id] as const)));
  for (const s of scored) {
    const cat = catOf.get(s.item.id)!;
    if (used.has(cat)) continue;
    used.add(cat);
    out.push(s.item);
    if (out.length === limit) return out;
  }
  for (const s of scored) {
    if (out.length === limit) break;
    if (!out.includes(s.item)) out.push(s.item);
  }
  return out;
}
