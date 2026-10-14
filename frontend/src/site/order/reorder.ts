import type { CartLine } from '../cart';
import type { CustomerOrder, MenuCategory } from '../types';

type NewLine = Omit<CartLine, 'key'>;

/**
 * "Order again": turns a past order back into cart lines using today's menu, so prices,
 * sizes and extras are current. Dishes that are gone or sold out are reported, not added;
 * an extra that no longer exists is dropped from its line. The server prices the cart again
 * at checkout, as always.
 */
export function reorderLines(order: Pick<CustomerOrder, 'items'>, menu: MenuCategory[]): { lines: NewLine[]; missing: string[] } {
  const items = new Map(menu.flatMap((c) => c.items).map((i) => [i.id, i]));
  const lines: NewLine[] = [];
  const missing: string[] = [];
  for (const old of order.items) {
    const item = old.item_id ? items.get(old.item_id) : undefined;
    if (!item || !item.is_available) {
      missing.push(old.name);
      continue;
    }
    const sizes = item.variants.filter((v) => v.is_available);
    let variant = null;
    if (item.variants.length) {
      variant = (old.variant_name ? sizes.find((v) => v.name === old.variant_name) : null) ?? (old.variant_name ? null : sizes.find((v) => v.is_default) ?? sizes[0] ?? null);
      if (!variant) {
        missing.push(old.variant_name ? `${old.name} (${old.variant_name})` : old.name);
        continue;
      }
    }
    const options = item.addon_groups.flatMap((g) => g.addons).filter((a) => a.is_available);
    const addons = old.addons.map((a) => options.find((o) => o.name === a.name)).filter((a): a is NonNullable<typeof a> => !!a);
    lines.push({
      item_id: item.id,
      variant_id: variant?.id ?? null,
      addon_ids: addons.map((a) => a.id),
      quantity: old.quantity,
      notes: old.notes ?? '',
      name: item.name,
      name_hi: item.name_hi,
      translations: item.translations,
      variant_name: variant?.name ?? null,
      addon_names: addons.map((a) => a.name),
      unit_price: Number(variant?.price ?? item.price) + addons.reduce((s, a) => s + Number(a.price), 0),
      food_type: item.food_type,
      image: item.image?.src ?? null,
    });
  }
  return { lines, missing };
}
