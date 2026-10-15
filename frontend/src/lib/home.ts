import type { Session } from '@/types';

/**
 * Where a signed-in person starts: super admin panel, onboarding, the business dashboard, or, for
 * delivery riders, their own phone screen (/rider/).
 */
export function homePath(session: Pick<Session, 'next' | 'role' | 'support'>): string {
  if (session.next === 'platform') return '/platform';
  if (session.next === 'onboarding') return '/onboarding';
  if (session.role === 'delivery' && !session.support) return '/rider/';
  return '/dashboard';
}
