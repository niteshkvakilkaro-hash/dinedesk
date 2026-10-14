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

describe('localize website milestones and search description', () => {
  const milestone = { year: '1990', title: 'First kitchen', title_hi: 'पहली रसोई', text: 'A small dhaba', text_hi: null, translations: { ta: { title: 'முதல் சமையலறை' } } };
  const seo = { description: 'Royal thalis', description_hi: null, translations: { bn: { description: 'রাজকীয় থালি' } } };

  it('uses each milestone’s own translations', () => {
    expect(localize(milestone, 'title', 'ta')).toBe('முதல் சமையலறை');
    expect(localize(milestone, 'title', 'hi')).toBe('पहली रसोई');
    expect(localize(milestone, 'text', 'ta')).toBe('A small dhaba');
    expect(localize(milestone, 'title', 'bn')).toBe('First kitchen');
  });

  it('picks the search description in the page language', () => {
    expect(localize(seo, 'description', 'bn')).toBe('রাজকীয় থালি');
    expect(localize(seo, 'description', 'hi')).toBe('Royal thalis');
    expect(localize(seo, 'description', 'en')).toBe('Royal thalis');
  });
});
