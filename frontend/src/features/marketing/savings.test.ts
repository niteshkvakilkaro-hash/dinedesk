import { describe, expect, it } from 'vitest';
import { savings } from './Savings';

describe('savings', () => {
  it('works out commission per month and year, less the plan', () => {
    const r = savings(600, 400, 25, 999);
    expect(r.monthly).toBe(60000);
    expect(r.yearly).toBe(720000);
    expect(r.kept).toBe(720000 - 999 * 12);
  });
  it('never shows a negative saving', () => {
    expect(savings(50, 100, 5, 5000).kept).toBe(0);
  });
});
