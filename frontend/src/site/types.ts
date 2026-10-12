import type { BusinessType, OpeningHours } from '@/types';
import type { Holiday, OpenStatus } from '@/lib/openStatus';
import type { ThemeKey } from '@/themes/types';

export type SectionKey = 'specials' | 'story' | 'menu_preview' | 'gallery' | 'hours' | 'visit';

export interface SiteImage {
  src: string;
  srcset: string;
  width: number;
  height: number;
  placeholder: string | null;
  credit?: { author: string; license: string; license_url: string | null; source: string } | null;
}

export interface Milestone {
  year: string;
  title: string;
  title_hi: string | null;
  text: string | null;
  text_hi: string | null;
}

export interface SiteContent {
  tagline: string | null;
  tagline_hi: string | null;
  about: string | null;
  about_hi: string | null;
  milestones: Milestone[];
  contact: { phone: string | null; whatsapp: string | null; email: string | null; address: string | null; map_url: string | null; parking?: string | null };
  socials: { instagram: string | null; facebook: string | null; youtube: string | null; google_maps: string | null; google_review?: string | null };
  seo: { description: string | null; description_hi: string | null };
  legal?: { fssai: string | null; show_gstin: boolean };
}

export interface SiteTheme {
  key: ThemeKey;
  primary_color: string | null;
  accent_color: string | null;
  logo: SiteImage | null;
  cover: SiteImage | null;
  sections: { key: SectionKey; visible: boolean }[];
}

export interface SiteData {
  name: string;
  business_type: BusinessType;
  city: string | null;
  status: string;
  is_live: boolean;
  is_demo: boolean;
  timezone: string;
  /** Only when the owner chose to show it in the footer. */
  gstin?: string | null;
  theme: SiteTheme;
  content: SiteContent;
  opening_hours: OpeningHours | null;
  holidays: Holiday[];
  open_status: (OpenStatus & { timezone: string }) | null;
  has_menu: boolean;
  has_gallery: boolean;
  /** Tiffin / meal plans on offer. */
  has_tiffin?: boolean;
  features: { online_ordering: boolean; reservations: boolean; qr_ordering: boolean; hotel?: boolean };
  /** Hotel pages (rooms, room-service QR, event enquiries); null when the plan has no hotel module. */
  hotel?: HotelInfo | null;
  reservations: ReservationInfo;
  growth: GrowthInfo;
  ordering: OrderingInfo;
  seo: { title: string; description: string; description_hi: string | null; canonical: string; image: string | null; indexable: boolean };
}

/** Diet labels an owner can set on a dish (same list as the backend's MenuItem::DIETS). */
export const DIETS = ['jain', 'no_onion_garlic', 'vegan', 'gluten_free'] as const;
export type Diet = (typeof DIETS)[number];

export interface MenuItem {
  id: number;
  name: string;
  name_hi: string | null;
  description: string | null;
  description_hi: string | null;
  price: string;
  food_type: 'veg' | 'non_veg' | 'egg';
  spice_level: number;
  allergens: string[];
  diet_tags: Diet[];
  is_available: boolean;
  is_bestseller: boolean;
  is_chefs_special: boolean;
  image: SiteImage | null;
  is_demo: boolean;
  variants: ItemVariant[];
  addon_groups: AddonGroup[];
}

export interface ItemVariant {
  id: number;
  name: string;
  name_hi: string | null;
  price: string;
  is_default: boolean;
  is_available: boolean;
}

export interface Addon {
  id: number;
  name: string;
  name_hi: string | null;
  price: string;
  food_type: 'veg' | 'non_veg' | 'egg';
  is_available: boolean;
}

export interface AddonGroup {
  id: number;
  name: string;
  name_hi: string | null;
  min_select: number;
  max_select: number | null;
  addons: Addon[];
}

export interface MenuCategory {
  id: number;
  name: string;
  name_hi: string | null;
  slug: string;
  is_demo: boolean;
  items: MenuItem[];
}

export interface GalleryItem {
  id: number;
  image: SiteImage | null;
  alt_text: string;
  caption: string | null;
  category: 'food' | 'interior' | 'events';
  sort_order: number;
  is_demo: boolean;
}

export type OrderType = 'delivery' | 'takeaway' | 'dine_in' | 'room_service';
/** room = charged to the guest's room (paid at check-out). */
export type PaymentMethod = 'online' | 'cod' | 'counter' | 'room' | 'upi';

export interface HotelInfo {
  has_rooms: boolean;
  online_booking: boolean;
  room_service: boolean;
  banquets: boolean;
  check_in_time: string;
  check_out_time: string;
}
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'completed' | 'cancelled';

export interface SiteBanner {
  id: number;
  placement: 'bar' | 'popup' | 'offer';
  title: string;
  title_hi: string | null;
  text: string | null;
  text_hi: string | null;
  cta_label: string | null;
  cta_link: string | null;
  coupon_code: string | null;
  ends_at: string | null;
}

export interface GrowthInfo {
  banners: SiteBanner[];
  has_offers: boolean;
  coupons: boolean;
  loyalty: { enabled: boolean; earn_per_100?: number; point_value?: number; min_redeem?: number; max_redeem_percent?: number };
  reviews: { count: number; average: number | null; items: { name: string | null; rating: number; comment: string | null; reply: string | null; date: string }[] };
}

export interface ReservationInfo {
  enabled: boolean;
  auto_confirm: boolean;
  min_party: number;
  max_party: number;
  max_days: number;
  duration_minutes: number;
  blackout_dates: { date: string; label: string | null }[];
}

export interface OrderingInfo {
  enabled: boolean;
  types: OrderType[];
  payment_methods: Partial<Record<OrderType, PaymentMethod[]>>;
  scheduling: { enabled: boolean; max_days: number };
  prep_minutes: number;
  delivery_minutes: number;
  packaging_fee: string;
  prices_include_tax: boolean;
  default_tax_rate: number;
  has_delivery_zones: boolean;
  /** The restaurant's UPI ID, when guests may pay it directly. */
  upi: { vpa: string; payee: string } | null;
}

export interface QuoteLine {
  menu_item_id: number;
  name: string;
  name_hi: string | null;
  variant_name: string | null;
  addons: { id: number; name: string; price: string }[];
  food_type: 'veg' | 'non_veg' | 'egg';
  unit_price: string;
  quantity: number;
  tax_rate: string;
  line_subtotal: string;
  line_tax: string;
  line_total: string;
  notes: string | null;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: string;
  tax_total: string;
  cgst: string;
  sgst: string;
  items_total: string;
  packaging_fee: string;
  delivery_fee: string;
  total: string;
  prices_include_tax: boolean;
  zone: { id: number; name: string; fee: string; min_order: string; free_above: string | null } | null;
  zone_error: { message: string; code: string; min_order?: string } | null;
  discount_total?: string | null;
  discount_label?: string | null;
  coupon?: { code: string; discount: string } | null;
  loyalty?: { points: number; discount: string } | null;
  offer_error?: { message: string; code: string; field: string | null } | null;
}

export interface CustomerOrder {
  id: string;
  number: number;
  type: OrderType;
  status: OrderStatus;
  scheduled_for: string | null;
  placed_at: string;
  customer_name: string;
  address: { line1: string | null; line2: string | null; landmark: string | null; pincode: string | null } | null;
  table_label: string | null;
  notes: string | null;
  items: { item_id: number | null; name: string; name_hi: string | null; variant_name: string | null; addons: { name: string; price: string }[]; food_type: 'veg' | 'non_veg' | 'egg'; unit_price: string; quantity: number; tax_rate: string; line_total: string; notes: string | null }[];
  subtotal: string;
  tax_total: string;
  delivery_fee: string;
  packaging_fee: string;
  discount_total: string;
  discount_label?: string | null;
  total: string;
  prices_include_tax: boolean;
  payment_method: PaymentMethod;
  payment_status: 'unpaid' | 'pending' | 'paid' | 'failed' | 'refund_due' | 'refunded';
  /** UPI reference (UTR) the guest gave for a UPI payment. */
  payment_reference?: string | null;
  cancel_reason: string | null;
  timeline: { status: OrderStatus; at: string }[];
}
