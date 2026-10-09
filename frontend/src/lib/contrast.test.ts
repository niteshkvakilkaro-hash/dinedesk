import { contrastRatio, contrastWarnings, readableOn } from './contrast';

describe('contrast', () => {
  it('matches WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#641E16', '#FFF8E9')).toBeCloseTo(contrastRatio('#FFF8E9', '#641E16'), 10);
  });

  it('picks readable text colour', () => {
    expect(readableOn('#641E16')).toBe('#FFFFFF');
    expect(readableOn('#FFCB2E')).toBe('#141414');
  });

  const haveli = { background: '#FFF8E9', text: '#2B2118', accentRole: 'fill' as const };
  const bistro = { background: '#F6F3EE', text: '#1E1D1B', accentRole: 'ink' as const };

  it('warns when white button text on the primary colour falls below AA', () => {
    expect(contrastWarnings(haveli, '#FFEE88', null)).toEqual([{ field: 'primary_color', ratio: expect.any(Number), required: 4.5 }]);
    expect(contrastWarnings(haveli, '#641E16', null)).toEqual([]);
  });

  it('checks the accent the way the theme uses it', () => {
    // fill: dark text sits on the accent, so a dark accent is the problem
    expect(contrastWarnings(haveli, null, '#3A2A20')).toHaveLength(1);
    expect(contrastWarnings(haveli, null, '#C9A45C')).toEqual([]);
    // ink: the accent is text on the page, so a pale accent is the problem
    expect(contrastWarnings(bistro, null, '#D9E3C5')).toHaveLength(1);
    expect(contrastWarnings(bistro, null, '#5B6B3A')).toEqual([]);
  });

  it('ignores incomplete hex input', () => {
    expect(contrastWarnings(haveli, '#FFF', '#12')).toEqual([]);
  });
});
