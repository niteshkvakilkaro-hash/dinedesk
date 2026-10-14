/**
 * Refer a business: a visitor who arrives with ?ref=CODE (any marketing page or /signup)
 * keeps the code for 30 days, so it reaches business creation even if they sign up later.
 * The server checks the code; a wrong one is simply ignored.
 */

const KEY = 'dd.referral';
const DAYS = 30;
const CODE = /^[A-HJ-NP-Z2-9]{8}$/;

/** "ab cd-2345" → "ABCD2345"; null when it can't be a code. */
export function normalizeReferral(raw: string | null | undefined): string | null {
  const code = (raw ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return CODE.test(code) ? code : null;
}

/** Remembers ?ref= from a query string (a newer link replaces an older code). */
export function captureReferral(search: string, now = Date.now()): string | null {
  const code = normalizeReferral(new URLSearchParams(search).get('ref'));
  if (!code) return null;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: now }));
  } catch {
    /* private mode: the code just isn't kept */
  }
  return code;
}

/** The kept code, if it is younger than 30 days. */
export function storedReferral(now = Date.now()): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { code?: string; at?: number } | null;
    const code = normalizeReferral(v?.code);
    if (code && typeof v?.at === 'number' && now - v.at < DAYS * 86_400_000) return code;
    if (v) localStorage.removeItem(KEY);
  } catch {
    /* unreadable: treat as none */
  }
  return null;
}

export function clearReferral() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** WhatsApp share link with the text filled in (no number: the owner picks the chat). */
export function whatsappShare(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
