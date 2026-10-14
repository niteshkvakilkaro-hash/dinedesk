import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { GalleryItem, SiteContent, SiteTheme } from '@/site/types';
import type { ThemeKey } from '@/themes/types';

export interface EditableContent extends Omit<SiteContent, 'contact'> {
  contact: SiteContent['contact'] & { whatsapp_verified: boolean };
}

export interface ServerWarning {
  field: 'primary_color' | 'accent_color';
  ratio: number;
  required: number;
  message: string;
}

export interface WebsiteData {
  theme: SiteTheme;
  content: EditableContent;
  warnings: ServerWarning[];
  themes: { key: ThemeKey; primary: string; accent: string; background: string; text: string; accent_role: 'fill' | 'ink' }[];
  site_url: string;
  /** Shown in the DineDesk app's place finder. */
  directory_listed: boolean;
}

export type ThemeUpdate = Partial<Pick<SiteTheme, 'key' | 'primary_color' | 'accent_color' | 'sections'>>;

export function useWebsite(enabled = true) {
  return useQuery({ queryKey: ['website'], queryFn: async () => (await api.get<WebsiteData>('/tenant/website')).data, enabled });
}

export function useSaveTheme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, ...rest }: ThemeUpdate) => (await api.put<WebsiteData>('/tenant/website/theme', { ...(key ? { theme: key } : {}), ...rest })).data,
    onSuccess: (data) => qc.setQueryData(['website'], data),
  });
}

export function useSaveContent() {
  const qc = useQueryClient();
  return useMutation<WebsiteData, ApiError, EditableContent>({
    mutationFn: async (content) => (await api.put<WebsiteData>('/tenant/website/content', content)).data,
    onSuccess: (data) => qc.setQueryData(['website'], data),
  });
}

export function useSiteImage(slot: 'logo' | 'cover') {
  const qc = useQueryClient();
  const upload = useMutation<WebsiteData, ApiError, File>({
    mutationFn: async (file) => {
      const body = new FormData();
      body.append('image', file);
      return (await api.post<WebsiteData>(`/tenant/website/images/${slot}`, body)).data;
    },
    onSuccess: (data) => qc.setQueryData(['website'], data),
  });
  const remove = useMutation<WebsiteData, ApiError, void>({
    mutationFn: async () => (await api.delete<WebsiteData>(`/tenant/website/images/${slot}`)).data,
    onSuccess: (data) => qc.setQueryData(['website'], data),
  });
  return { upload, remove };
}

export function useGallery() {
  return useQuery({
    queryKey: ['gallery'],
    queryFn: async () => {
      const res = await api.get<GalleryItem[]>('/tenant/gallery');
      return { items: res.data, max: (res.meta as { max?: number } | null)?.max ?? 60 };
    },
  });
}

/** Show (or hide) this business in the DineDesk app's place finder. */
export function useSaveDirectory() {
  const qc = useQueryClient();
  return useMutation<{ listed: boolean }, ApiError, boolean>({
    mutationFn: async (listed) => (await api.put<{ listed: boolean }>('/tenant/website/directory', { listed })).data,
    onSuccess: ({ listed }) => qc.setQueryData<WebsiteData>(['website'], (old) => (old ? { ...old, directory_listed: listed } : old)),
  });
}
