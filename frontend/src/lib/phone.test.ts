import { describe, expect, it } from 'vitest';
import { cleanPhoneInput, isIndianMobile, mobileDigits } from './format';

describe('phone fields', () => {
  it('keep digits, + and separators from typed, pasted or autofilled text', () => {
    expect(cleanPhoneInput('+91 85028-37831')).toBe('+91 85028-37831');
    expect(cleanPhoneInput('Mob: 85028 37831 (WhatsApp)')).toBe(' 85028 37831 ');
    expect(cleanPhoneInput('1234567890123456789')).toHaveLength(16);
  });

  it('count the mobile digits without the +91 / 0 prefix', () => {
    expect(mobileDigits('8502837')).toBe('8502837');
    expect(mobileDigits('+91 85028 37831')).toBe('8502837831');
    expect(mobileDigits('08502837831')).toBe('8502837831');
  });

  it('accept the usual ways of writing an Indian mobile', () => {
    for (const v of ['8502837831', '+91 85028 37831', '085028-37831', '91 8502837831']) expect(isIndianMobile(v)).toBe(true);
    expect(isIndianMobile('8502837')).toBe(false);
  });
});
