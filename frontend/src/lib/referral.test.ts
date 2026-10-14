import { captureReferral, clearReferral, normalizeReferral, storedReferral, whatsappShare } from './referral';

describe('referral codes', () => {
  beforeEach(() => localStorage.clear());

  it('normalizes codes and rejects anything else', () => {
    expect(normalizeReferral(' abcd-2345 ')).toBe('ABCD2345');
    expect(normalizeReferral('ABCD1234')).toBeNull(); // 1 is never used
    expect(normalizeReferral('ABC')).toBeNull();
    expect(normalizeReferral(null)).toBeNull();
  });

  it('keeps ?ref= for 30 days, newest link wins', () => {
    const t0 = Date.UTC(2026, 9, 1);
    expect(captureReferral('?utm=x&ref=abcd2345', t0)).toBe('ABCD2345');
    expect(captureReferral('?ref=nope', t0)).toBeNull();
    expect(storedReferral(t0 + 29 * 86_400_000)).toBe('ABCD2345');
    captureReferral('?ref=WXYZ6789', t0 + 1000);
    expect(storedReferral(t0 + 2000)).toBe('WXYZ6789');
    expect(storedReferral(t0 + 31 * 86_400_000)).toBeNull();
    expect(localStorage.getItem('dd.referral')).toBeNull();
  });

  it('can be cleared after the business is created', () => {
    captureReferral('?ref=ABCD2345');
    clearReferral();
    expect(storedReferral()).toBeNull();
  });

  it('builds a WhatsApp link with the text', () => {
    expect(whatsappShare('Join me & save: https://x.test/?ref=ABCD2345')).toBe('https://wa.me/?text=Join%20me%20%26%20save%3A%20https%3A%2F%2Fx.test%2F%3Fref%3DABCD2345');
  });
});
