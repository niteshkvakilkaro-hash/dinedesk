import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** What the platform can offer before sign-in (GET /public/config). */
export interface PublicConfig {
  support: { whatsapp: string | null; email: string | null; chatbot: boolean };
  sign_in: { mobile: boolean };
  billing: { online: boolean };
}

export function usePublicConfig() {
  return useQuery({
    queryKey: ['public-config'],
    queryFn: async () => (await api.get<PublicConfig>('/public/config')).data,
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

/** A wa.me link to the platform's WhatsApp, with a message ready to send. */
export function whatsappUrl(number: string | null | undefined, text: string): string | null {
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}
