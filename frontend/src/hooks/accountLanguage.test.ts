import { accountLanguage } from './accountLanguage';

describe('accountLanguage', () => {
  const session = (locale: string, support: boolean = false) => ({ user: { locale } as never, support: support ? { reason: 'help', read_only: true, expires_at: '' } : null });

  it('always uses the saved language right after signing in', () => {
    expect(accountLanguage(session('ta'), { signIn: true, deviceChoice: true, support: false })).toBe('ta');
    expect(accountLanguage(session('en'), { signIn: true, deviceChoice: true, support: false })).toBe('en');
  });

  it('on a session load, only when this device has no language of its own', () => {
    expect(accountLanguage(session('bn'), { signIn: false, deviceChoice: false, support: false })).toBe('bn');
    expect(accountLanguage(session('bn'), { signIn: false, deviceChoice: true, support: false })).toBeNull();
  });

  it('never in a support session, nor for an unknown language', () => {
    expect(accountLanguage(session('ta', true), { signIn: true, deviceChoice: false, support: false })).toBeNull();
    expect(accountLanguage(session('ta'), { signIn: false, deviceChoice: false, support: true })).toBeNull();
    expect(accountLanguage(session('fr'), { signIn: true, deviceChoice: false, support: false })).toBeNull();
  });
});
