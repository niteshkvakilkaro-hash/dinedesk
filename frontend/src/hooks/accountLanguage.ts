import i18n, { languageChosenOnDevice } from '@/i18n';
import { LANGUAGE_CODES } from '@/i18n/locale';
import { isSupportTab } from '@/stores/auth';
import type { Session } from '@/types';

/**
 * The dashboard language to switch to for the account's saved language (users.locale), or null to
 * leave the current one: always right after signing in; when a session loads, only on a device
 * with no language of its own chosen yet. Never in a super admin's support session (that's
 * someone else's account).
 */
export function accountLanguage(session: Pick<Session, 'support' | 'user'>, opts: { signIn: boolean; deviceChoice: boolean; support: boolean }): string | null {
  if (opts.support || session.support) return null;
  const code = session.user?.locale;
  if (!code || !(LANGUAGE_CODES as readonly string[]).includes(code)) return null;
  if (!opts.signIn && opts.deviceChoice) return null;
  return code;
}

// A session load applies it at most once per page load (the person may switch afterwards).
let loaded = false;

/** Switches i18n (which also remembers it on this device as dd_lang) when accountLanguage says so. */
export function adoptAccountLanguage(session: Session, signIn: boolean) {
  if (!signIn && loaded) return;
  loaded = true;
  const code = accountLanguage(session, { signIn, deviceChoice: languageChosenOnDevice, support: isSupportTab() });
  if (code && code !== i18n.language) void i18n.changeLanguage(code);
}
