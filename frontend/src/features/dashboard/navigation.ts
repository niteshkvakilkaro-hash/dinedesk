import {
  BedDouble, BellRing, Building2, CalendarClock, CalendarDays, CalendarRange, ChefHat, ClipboardList, Contact, CookingPot, CreditCard, Download, FileSpreadsheet, Gift, Globe, Globe2,
  Hotel, ImageIcon, Images, IndianRupee, Languages, LayoutDashboard, LineChart, Megaphone, MessageCircle, MessageSquareHeart, Network, Package, PartyPopper, Percent, Printer,
  QrCode, ReceiptText, Repeat, Settings, Settings2, Smartphone, Sparkles, Star, Store, Tag, Timer, Truck, UserCheck, Users, UtensilsCrossed, Wallet, WifiOff, Workflow, Bike, MapPin, Bell,
} from 'lucide-react';
import type { Session } from '@/types';

/**
 * What the signed-in person may open, from their permissions and the plan's features.
 * The sidebar, the Settings page and the dashboard search all use these same gates
 * (the API enforces the same rules).
 */
export type Access = ReturnType<typeof accessFrom>;

export function accessFrom(session: Pick<Session, 'permissions' | 'features' | 'branches' | 'tenant'> | null | undefined) {
  const perms = new Set(session?.permissions ?? []);
  const can = (p: string) => perms.has(p);
  const has = (f: string) => Boolean(session?.features?.[f]);
  const business = can('business.manage');
  return {
    orders: can('orders.view'),
    reservations: can('reservations.manage') && has('reservations'),
    tables: (can('tables.manage') || can('tables.setup')) && has('qr_ordering'),
    tablesSetup: can('tables.setup') && has('qr_ordering'),
    pos: can('pos.use') && has('pos'),
    kitchen: can('kot.update') && has('kds'),
    waiter: can('tables.manage') && can('orders.create') && has('qr_ordering') && !can('pos.use'),
    menu: can('menu.manage'),
    tiffin: can('orders.manage'),
    hotel: has('hotel') && (can('rooms.manage') || can('housekeeping.update') || can('rooms.setup')),
    hotelDesk: has('hotel') && can('rooms.manage'),
    housekeeping: has('hotel') && can('housekeeping.update'),
    hotelSetup: has('hotel') && can('rooms.setup'),
    customers: can('customers.view'),
    marketing: can('marketing.manage') && (has('coupons') || has('loyalty')),
    coupons: can('marketing.manage') && has('coupons'),
    loyalty: can('marketing.manage') && has('loyalty'),
    inventory: can('inventory.manage') && has('inventory'),
    reports: can('reports.view'),
    website: can('theme.manage'),
    business,
    team: can('staff.manage'),
    rota: can('staff.schedule'),
    branches: business && (has('multi_branch') || (session?.branches.length ?? 0) > 1),
    billing: can('billing.manage') || business,
    referral: can('billing.manage') && !session?.tenant?.is_branch,
  };
}

type AccessKey = keyof Access;
type Icon = typeof LayoutDashboard;

/** The pages that live under Settings (they keep their own URLs). */
export const SETTINGS_PAGES = ['/dashboard/business', '/dashboard/ordering', '/dashboard/team', '/dashboard/rota', '/dashboard/branches', '/dashboard/domains', '/dashboard/billing'] as const;
const SETTINGS_GATES: AccessKey[] = ['business', 'team', 'rota', 'branches', 'billing'];

export function isSettingsPath(pathname: string) {
  const p = pathname.replace(/\/+$/, '');
  return p === '/dashboard/settings' || SETTINGS_PAGES.some((s) => p === s);
}

export type NavGroupKey = 'today' | 'menuRooms' | 'customers' | 'money' | 'website' | 'settings';
export type BadgeKey = 'orders' | 'bookings' | 'tables';
export interface NavDef {
  to: string;
  /** i18n key under dashboard.nav */
  label: string;
  icon: Icon;
  show: (a: Access) => boolean;
  end?: boolean;
  badge?: BadgeKey;
  /** Other paths that light up this item (Settings is active on every settings page). */
  activeFor?: (pathname: string) => boolean;
}

export const NAV: { key: NavGroupKey; items: NavDef[] }[] = [
  {
    key: 'today',
    items: [
      { to: '/dashboard', label: 'overview', icon: LayoutDashboard, end: true, show: () => true },
      { to: '/dashboard/orders', label: 'orders', icon: ReceiptText, show: (a) => a.orders, badge: 'orders' },
      { to: '/dashboard/reservations', label: 'reservations', icon: CalendarDays, show: (a) => a.reservations, badge: 'bookings' },
      { to: '/dashboard/tables', label: 'tables', icon: QrCode, show: (a) => a.tables, badge: 'tables' },
      { to: '/dashboard/pos', label: 'pos', icon: Store, show: (a) => a.pos },
      { to: '/kitchen', label: 'kitchen', icon: ChefHat, show: (a) => a.kitchen },
      { to: '/waiter/', label: 'waiter', icon: Smartphone, show: (a) => a.waiter },
    ],
  },
  {
    key: 'menuRooms',
    items: [
      { to: '/dashboard/menu', label: 'menu', icon: UtensilsCrossed, show: (a) => a.menu },
      { to: '/dashboard/tiffin', label: 'tiffin', icon: CookingPot, show: (a) => a.tiffin },
      { to: '/dashboard/hotel', label: 'hotel', icon: Hotel, show: (a) => a.hotel },
    ],
  },
  {
    key: 'customers',
    items: [
      { to: '/dashboard/customers', label: 'customers', icon: Contact, show: (a) => a.customers },
      { to: '/dashboard/marketing', label: 'marketing', icon: Megaphone, show: (a) => a.marketing },
    ],
  },
  {
    key: 'money',
    items: [
      { to: '/dashboard/reports', label: 'reports', icon: LineChart, show: (a) => a.reports },
      { to: '/dashboard/finance', label: 'finance', icon: Wallet, show: (a) => a.reports },
      { to: '/dashboard/inventory', label: 'inventory', icon: Package, show: (a) => a.inventory },
    ],
  },
  {
    key: 'website',
    items: [
      { to: '/dashboard/website', label: 'website', icon: Globe, show: (a) => a.website },
      { to: '/dashboard/gallery', label: 'gallery', icon: Images, show: (a) => a.website },
    ],
  },
  {
    key: 'settings',
    items: [{ to: '/dashboard/settings', label: 'settings', icon: Settings, show: (a) => SETTINGS_GATES.some((k) => a[k]), activeFor: isSettingsPath }],
  },
];

/** The sidebar for this person: only what they may open, empty groups left out. */
export function navGroups(access: Access) {
  return NAV.map((g) => ({ key: g.key, items: g.items.filter((i) => i.show(access)) })).filter((g) => g.items.length > 0);
}

/**
 * Everything the dashboard search can find: every page, plus the features that live inside
 * a page (a tab, a dialog or a section), linked straight to it. Titles, descriptions and
 * keywords are in the i18n files under dashboard.find.items.<id> (keywords: space-separated,
 * in that language; English keywords are always searched too).
 */
export interface Destination {
  id: string;
  to: string;
  icon: Icon;
  group: NavGroupKey;
  show: (a: Access) => boolean;
  /** i18n key of the title (pages reuse their menu label). */
  title: string;
}

const page = (id: string, to: string, icon: Icon, group: NavGroupKey, show: (a: Access) => boolean, nav = id): Destination => ({ id, to, icon, group, show, title: `dashboard.nav.${nav}` });
const item = (id: string, to: string, icon: Icon, group: NavGroupKey, show: (a: Access) => boolean): Destination => ({ id, to, icon, group, show, title: `dashboard.find.items.${id}.title` });

export const DESTINATIONS: Destination[] = [
  // Today
  page('overview', '/dashboard', LayoutDashboard, 'today', () => true),
  page('orders', '/dashboard/orders', ReceiptText, 'today', (a) => a.orders),
  page('reservations', '/dashboard/reservations', CalendarDays, 'today', (a) => a.reservations),
  page('tables', '/dashboard/tables', QrCode, 'today', (a) => a.tables),
  item('tableQr', '/dashboard/tables?tab=setup', QrCode, 'today', (a) => a.tablesSetup),
  page('pos', '/dashboard/pos', Store, 'today', (a) => a.pos),
  item('appOrders', '/dashboard/pos', Bike, 'today', (a) => a.pos),
  item('offlinePos', '/dashboard/pos', WifiOff, 'today', (a) => a.pos),
  item('printers', '/dashboard/pos', Printer, 'today', (a) => a.pos || a.kitchen),
  item('dayEnd', '/dashboard/day-end', ClipboardList, 'today', (a) => a.reports),
  page('kitchen', '/kitchen', ChefHat, 'today', (a) => a.kitchen),
  page('waiter', '/waiter/', Smartphone, 'today', (a) => a.waiter),
  // Menu & rooms
  page('menu', '/dashboard/menu', UtensilsCrossed, 'menuRooms', (a) => a.menu),
  item('aiImport', '/dashboard/menu?open=ai-import', Sparkles, 'menuRooms', (a) => a.menu),
  item('menuLanguages', '/dashboard/menu/languages', Languages, 'menuRooms', (a) => a.menu),
  item('stations', '/dashboard/menu', ChefHat, 'menuRooms', (a) => a.menu),
  page('tiffin', '/dashboard/tiffin', CookingPot, 'menuRooms', (a) => a.tiffin),
  page('hotel', '/dashboard/hotel', Hotel, 'menuRooms', (a) => a.hotel),
  item('housekeeping', '/dashboard/hotel?tab=housekeeping', BedDouble, 'menuRooms', (a) => a.housekeeping),
  item('events', '/dashboard/hotel?tab=events', PartyPopper, 'menuRooms', (a) => a.hotelDesk),
  item('calendarSync', '/dashboard/hotel?tab=setup', CalendarRange, 'menuRooms', (a) => a.hotelSetup),
  // Customers & offers
  page('customers', '/dashboard/customers', Contact, 'customers', (a) => a.customers),
  item('feedback', '/dashboard/customers?tab=feedback', MessageSquareHeart, 'customers', (a) => a.customers),
  page('marketing', '/dashboard/marketing', Megaphone, 'customers', (a) => a.marketing),
  item('coupons', '/dashboard/marketing?tab=coupons', Tag, 'customers', (a) => a.coupons),
  item('loyalty', '/dashboard/marketing?tab=loyalty', Star, 'customers', (a) => a.loyalty),
  item('giftCards', '/dashboard/marketing?tab=cards', Gift, 'customers', (a) => a.loyalty),
  item('banners', '/dashboard/marketing?tab=banners', ImageIcon, 'customers', (a) => a.coupons),
  item('campaigns', '/dashboard/marketing?tab=campaigns', MessageCircle, 'customers', (a) => a.coupons),
  item('automations', '/dashboard/marketing?tab=automations', Workflow, 'customers', (a) => a.coupons),
  // Money
  page('reports', '/dashboard/reports', LineChart, 'money', (a) => a.reports),
  item('dailySummary', '/dashboard/reports?open=daily-summary', BellRing, 'money', (a) => a.reports),
  item('gst', '/dashboard/reports?open=gst', FileSpreadsheet, 'money', (a) => a.reports),
  page('finance', '/dashboard/finance', Wallet, 'money', (a) => a.reports),
  item('expenses', '/dashboard/finance?tab=expenses', IndianRupee, 'money', (a) => a.reports),
  item('dishProfit', '/dashboard/finance?tab=dishes', Percent, 'money', (a) => a.reports),
  page('inventory', '/dashboard/inventory', Package, 'money', (a) => a.inventory),
  item('recipes', '/dashboard/inventory?tab=recipes', CookingPot, 'money', (a) => a.inventory),
  item('purchases', '/dashboard/inventory?tab=purchases', Truck, 'money', (a) => a.inventory),
  item('suppliers', '/dashboard/inventory?tab=suppliers', Users, 'money', (a) => a.inventory),
  // Website
  page('website', '/dashboard/website', Globe, 'website', (a) => a.website),
  item('logo', '/dashboard/website?tab=images', ImageIcon, 'website', (a) => a.website),
  page('gallery', '/dashboard/gallery', Images, 'website', (a) => a.website),
  // Settings
  page('settings', '/dashboard/settings', Settings, 'settings', (a) => SETTINGS_GATES.some((k) => a[k])),
  page('business', '/dashboard/business', Building2, 'settings', (a) => a.business),
  item('hours', '/dashboard/business?open=hours', Timer, 'settings', (a) => a.business),
  item('ordering', '/dashboard/ordering', Settings2, 'settings', (a) => a.business),
  item('payments', '/dashboard/ordering?open=payments', IndianRupee, 'settings', (a) => a.business),
  item('whatsappOrders', '/dashboard/ordering?open=whatsapp', MessageCircle, 'settings', (a) => a.business),
  item('deliveryApps', '/dashboard/ordering?open=apps', Bike, 'settings', (a) => a.business),
  item('deliveryZones', '/dashboard/ordering?open=zones', MapPin, 'settings', (a) => a.business),
  item('charges', '/dashboard/ordering?open=charges', Percent, 'settings', (a) => a.business),
  item('alerts', '/dashboard/ordering?open=notify', Bell, 'settings', (a) => a.business),
  page('team', '/dashboard/team', Users, 'settings', (a) => a.team),
  page('rota', '/dashboard/rota', CalendarClock, 'settings', (a) => a.rota),
  item('attendance', '/dashboard/rota?tab=attendance', UserCheck, 'settings', (a) => a.rota),
  page('branches', '/dashboard/branches', Network, 'settings', (a) => a.branches),
  page('domains', '/dashboard/domains', Globe2, 'settings', (a) => a.business),
  page('billing', '/dashboard/billing', CreditCard, 'settings', (a) => a.billing),
  item('referral', '/dashboard/billing?open=refer', Repeat, 'settings', (a) => a.referral),
  item('dataExport', '/dashboard/billing?open=export', Download, 'settings', (a) => a.business),
];

/** Where the printer settings are: the POS, or the kitchen screen for kitchen staff. */
export function destinationFor(d: Destination, a: Access) {
  return d.id === 'printers' && !a.pos ? { ...d, to: '/kitchen' } : d;
}

export function destinationsFor(access: Access) {
  return DESTINATIONS.filter((d) => d.show(access)).map((d) => destinationFor(d, access));
}

/** Cards on the Settings page, in sections. Each card reuses its search entry (title and description). */
export const SETTINGS_SECTIONS: { key: 'business' | 'people' | 'tools'; ids: string[] }[] = [
  { key: 'business', ids: ['business', 'ordering', 'payments', 'billing', 'domains', 'branches', 'referral', 'dataExport'] },
  { key: 'people', ids: ['team', 'rota'] },
  { key: 'tools', ids: ['tableQr', 'printers', 'menuLanguages', 'dailySummary', 'calendarSync', 'alerts'] },
];

export function settingsSections(access: Access) {
  const byId = new Map(destinationsFor(access).map((d) => [d.id, d]));
  return SETTINGS_SECTIONS.map((s) => ({ key: s.key, items: s.ids.map((id) => byId.get(id)).filter((d): d is Destination => !!d) })).filter((s) => s.items.length > 0);
}

