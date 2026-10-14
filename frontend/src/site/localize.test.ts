import { localize } from './localize';

describe('localize', () => {
  const dish = {
    name: 'Paneer Tikka',
    name_hi: 'पनीर टिक्का',
    description: 'Grilled cottage cheese',
    description_hi: '',
    translations: { ta: { name: 'பனீர் டிக்கா', description: '  ' }, bn: { name: '' } },
  };

  it('uses the Hindi field in Hindi', () => {
    expect(localize(dish, 'name', 'hi')).toBe('पनीर टिक्का');
    expect(localize(dish, 'name', 'hi-IN')).toBe('पनीर टिक्का');
  });

  it('uses the translation in the other languages', () => {
    expect(localize(dish, 'name', 'ta')).toBe('பனீர் டிக்கா');
  });

  it('falls back to English when a text is missing or empty', () => {
    expect(localize(dish, 'description', 'hi')).toBe('Grilled cottage cheese');
    expect(localize(dish, 'description', 'ta')).toBe('Grilled cottage cheese');
    expect(localize(dish, 'name', 'bn')).toBe('Paneer Tikka');
    expect(localize(dish, 'name', 'ml')).toBe('Paneer Tikka');
    expect(localize({ name: 'Dal', translations: [] }, 'name', 'ta')).toBe('Dal');
  });

  it('shows English in English (and for unknown languages)', () => {
    expect(localize(dish, 'name', 'en')).toBe('Paneer Tikka');
    expect(localize(dish, 'name', 'fr')).toBe('Paneer Tikka');
    expect(localize(dish, 'name', undefined)).toBe('Paneer Tikka');
  });

  it('gives null for nothing', () => {
    expect(localize(null, 'name', 'ta')).toBeNull();
    expect(localize({ name: '' }, 'name', 'ta')).toBeNull();
    expect(localize({ tagline: null }, 'tagline', 'hi')).toBeNull();
  });
});
