import { create } from 'zustand';
import type { MenuItem, OrderType } from './types';
import { localize, type Translations } from './localize';

/** A size or add-on's name in every language, kept on the cart line so the cart can show it in the guest's language. */
export interface CartChoice {
  name: string;
  name_hi: string | null;
  translations?: Translations;
}

/**
 * The visitor's cart for this restaurant, remembered on this device.
 * Prices here are only an estimate for instant feedback: the server re-prices
 * every line (and adds GST, packaging and delivery) in /site/orders/quote.
 */
export interface CartLine {
  key: string;
  item_id: number;
  variant_id: number | null;
  addon_ids: number[];
  quantity: number;
  notes: string;
  // Display snapshot
  name: string;
  name_hi: string | null;
  translations?: Translations;
  /** English (what the business sees, e.g. in a WhatsApp order). */
  variant_name: string | null;
  addon_names: string[];
  /** The same size and add-ons in every language (lines saved before these existed have only the English names). */
  variant?: CartChoice | null;
  addons?: CartChoice[];
  unit_price: number;
  food_type: MenuItem['food_type'];
  image: string | null;
}

interface CartState {
  lines: CartLine[];
  type: OrderType | null;
  open: boolean;
  /** Bumps on every add, so themes can play their add-to-cart animation. */
  addedTick: number;
  add: (line: Omit<CartLine, 'key'>) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  setType: (type: OrderType) => void;
  setOpen: (open: boolean) => void;
}

export const MAX_QTY = 50;

const storageKey = () => `dd_cart_${typeof window === 'undefined' ? 'x' : window.location.host}`;

function load(): Pick<CartState, 'lines' | 'type'> {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey()) ?? 'null');
    if (raw && Array.isArray(raw.lines)) return { lines: raw.lines, type: raw.type ?? null };
  } catch {
    /* ignore broken / unavailable storage */
  }
  return { lines: [], type: null };
}

function save(state: Pick<CartState, 'lines' | 'type'>) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({ lines: state.lines, type: state.type }));
  } catch {
    /* storage full or blocked: the cart still works for this visit */
  }
}

export const lineKey = (itemId: number, variantId: number | null, addonIds: number[], notes: string) =>
  [itemId, variantId ?? 0, [...addonIds].sort((a, b) => a - b).join('.'), notes.trim().toLowerCase()].join('|');

export const useCart = create<CartState>((set, get) => ({
  ...load(),
  open: false,
  addedTick: 0,
  add: (line) => {
    const key = lineKey(line.item_id, line.variant_id, line.addon_ids, line.notes);
    const lines = [...get().lines];
    const existing = lines.findIndex((l) => l.key === key);
    if (existing >= 0) lines[existing] = { ...lines[existing], quantity: Math.min(MAX_QTY, lines[existing].quantity + line.quantity) };
    else lines.push({ ...line, quantity: Math.min(MAX_QTY, line.quantity), key });
    set({ lines, addedTick: get().addedTick + 1 });
    save({ lines, type: get().type });
  },
  setQuantity: (key, quantity) => {
    const lines = quantity <= 0 ? get().lines.filter((l) => l.key !== key) : get().lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QTY, quantity) } : l));
    set({ lines });
    save({ lines, type: get().type });
  },
  remove: (key) => get().setQuantity(key, 0),
  clear: () => {
    set({ lines: [] });
    save({ lines: [], type: get().type });
  },
  setType: (type) => {
    set({ type });
    save({ lines: get().lines, type });
  },
  setOpen: (open) => set({ open }),
}));

export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0);
export const cartEstimate = (lines: CartLine[]) => lines.reduce((n, l) => n + l.unit_price * l.quantity, 0);

/** The parts of a menu size or add-on a cart line keeps. */
export const cartChoice = (c: CartChoice): CartChoice => ({ name: c.name, name_hi: c.name_hi, translations: c.translations });

/** A line's size and add-on names in the guest's language (English when there is no translation). */
export function lineExtras(line: Pick<CartLine, 'variant_name' | 'addon_names' | 'variant' | 'addons'>, lang?: string | null): string[] {
  const variant = line.variant ? localize(line.variant, 'name', lang) : line.variant_name;
  const addons = line.addons && line.addons.length === line.addon_names.length ? line.addons.map((a) => localize(a, 'name', lang) ?? a.name) : line.addon_names;
  return [variant, ...addons].filter((x): x is string => !!x);
}

/** Lines in the shape the API expects. */
export const apiLines = (lines: CartLine[]) =>
  lines.map((l) => ({ item_id: l.item_id, variant_id: l.variant_id, addon_ids: l.addon_ids, quantity: l.quantity, notes: l.notes || null }));
