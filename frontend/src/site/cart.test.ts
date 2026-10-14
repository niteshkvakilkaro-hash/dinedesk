import { cartChoice, lineExtras } from './cart';

describe('lineExtras', () => {
  const half = { id: 3, name: 'Half', name_hi: 'हाफ़', translations: { ta: { name: 'அரை' } }, price: '120', is_default: true, is_available: true };
  const butter = { name: 'Extra butter', name_hi: null, translations: { ta: { name: 'கூடுதல் வெண்ணெய்' } } };
  const cheese = { name: 'Cheese', name_hi: 'चीज़' };
  const line = { variant_name: 'Half', addon_names: ['Extra butter', 'Cheese'], variant: cartChoice(half), addons: [cartChoice(butter), cartChoice(cheese)] };

  it('shows the size and add-ons in the guest’s language', () => {
    expect(lineExtras(line, 'ta')).toEqual(['அரை', 'கூடுதல் வெண்ணெய்', 'Cheese']);
    expect(lineExtras(line, 'hi')).toEqual(['हाफ़', 'Extra butter', 'चीज़']);
  });

  it('is English in English and for unknown languages', () => {
    expect(lineExtras(line, 'en')).toEqual(['Half', 'Extra butter', 'Cheese']);
    expect(lineExtras(line, 'fr')).toEqual(['Half', 'Extra butter', 'Cheese']);
  });

  it('keeps only the names a line needs', () => {
    expect(cartChoice(half)).toEqual({ name: 'Half', name_hi: 'हाफ़', translations: { ta: { name: 'அரை' } } });
  });

  it('falls back to the English names for lines saved before translations were kept', () => {
    expect(lineExtras({ variant_name: 'Full', addon_names: ['Raita'] }, 'ta')).toEqual(['Full', 'Raita']);
    expect(lineExtras({ variant_name: null, addon_names: [] }, 'ta')).toEqual([]);
    expect(lineExtras({ variant_name: null, addon_names: [], variant: null, addons: [] }, 'ta')).toEqual([]);
  });
});
