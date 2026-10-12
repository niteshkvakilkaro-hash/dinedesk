import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, API_BASE } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import type { Diet, SiteImage } from '@/site/types';

export type FoodType = 'veg' | 'non_veg' | 'egg';

export interface AdminVariant {
  id?: number;
  name: string;
  name_hi: string | null;
  price: string;
  is_default?: boolean;
  is_available: boolean;
}

export interface AdminItem {
  id: number;
  category_id: number;
  name: string;
  name_hi: string | null;
  description: string | null;
  description_hi: string | null;
  price: string;
  tax_rate: string | null;
  food_type: FoodType;
  spice_level: number;
  allergens: string[];
  diet_tags: Diet[];
  is_available: boolean;
  is_bestseller: boolean;
  is_chefs_special: boolean;
  image: SiteImage | null;
  is_demo: boolean;
  variants: AdminVariant[];
  addon_group_ids: number[];
  sort_order: number;
}

export interface AdminCategory {
  id: number;
  name: string;
  name_hi: string | null;
  slug: string;
  tax_rate: string | null;
  is_active: boolean;
  is_demo: boolean;
  items: AdminItem[];
}

export interface AdminAddon {
  id?: number;
  name: string;
  name_hi: string | null;
  price: string;
  food_type: FoodType;
  is_available: boolean;
}

export interface AdminGroup {
  id: number;
  name: string;
  name_hi: string | null;
  min_select: number;
  max_select: number | null;
  is_demo: boolean;
  addons: AdminAddon[];
  items_count: number | null;
}

export interface MenuData {
  categories: AdminCategory[];
  addon_groups: AdminGroup[];
}

export interface MenuMeta {
  items_count: number;
  items_limit: number | null;
  has_demo: boolean;
  allergens: string[];
}

export function useAdminMenu() {
  return useQuery({
    queryKey: ['admin-menu'],
    queryFn: async () => {
      const res = await api.get<MenuData>('/tenant/menu');
      return { ...res.data, meta: res.meta as unknown as MenuMeta };
    },
  });
}

/** Any change → refresh the dashboard menu and the public site's cached menu. */
export function useMenuMutation<TVars, TData = unknown>(fn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-menu'] });
      void qc.invalidateQueries({ queryKey: ['site'] });
    },
  });
}

/** The CSV template needs the auth header, so it's fetched and saved as a blob. */
export async function downloadTemplate() {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${API_BASE}/tenant/menu/import/template`, { headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Host': window.location.host } });
  if (!res.ok) throw new Error('Could not download the template.');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dinedesk-menu-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
