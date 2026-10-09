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
  contact: { phone: string | null; whatsapp: string | null; email: string | null; address: string | null; map_url: string | null };
  socials: { instagram: string | null; facebook: string | null; youtube: string | null; google_maps: string | null };
  seo: { description: string | null; description_hi: string | null };
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
  theme: SiteTheme;
  content: SiteContent;
  opening_hours: OpeningHours | null;
  holidays: Holiday[];
  open_status: (OpenStatus & { timezone: string }) | null;
  has_menu: boolean;
  has_gallery: boolean;
  features: { online_ordering: boolean; reservations: boolean };
  seo: { title: string; description: string; description_hi: string | null; canonical: string; image: string | null; indexable: boolean };
}

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
  is_available: boolean;
  is_bestseller: boolean;
  is_chefs_special: boolean;
  image: SiteImage | null;
  is_demo: boolean;
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
