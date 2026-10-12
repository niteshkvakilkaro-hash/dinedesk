import { describe, expect, it } from 'vitest';
import { upiLink } from './upi';

describe('UPI payment link', () => {
  it('fills in payee, amount and note in the NPCI format', () => {
    const link = upiLink({ vpa: 'spiceroute@okicici', payee: 'Spice Route', amount: 435, note: 'Order #1042' });
    expect(link.startsWith('upi://pay?')).toBe(true);
    const p = new URLSearchParams(link.slice('upi://pay?'.length));
    expect(p.get('pa')).toBe('spiceroute@okicici');
    expect(p.get('pn')).toBe('Spice Route');
    expect(p.get('am')).toBe('435.00');
    expect(p.get('cu')).toBe('INR');
    expect(p.get('tn')).toBe('Order #1042');
    // Spaces as %20, not "+" (some UPI apps show the plus sign).
    expect(link).toContain('Spice%20Route');
  });
});
