import i18n from './index';
import ta from './ta.json';

describe('language switching', () => {
  it('settles on a regional English instead of looping', async () => {
    await i18n.changeLanguage('en-US');
    expect(i18n.t('common.appName')).toBe('DineDesk');
    expect(document.documentElement.lang).toBe('en-IN');
  });

  it('fetches a language file on first use and sets the page direction', async () => {
    await i18n.changeLanguage('ta');
    await vi.waitFor(() => expect(i18n.t('mk.hero.points.1')).toBe(ta.mk.hero.points[1]));
    expect(document.documentElement.lang).toBe('ta-IN');

    await i18n.changeLanguage('ur');
    await vi.waitFor(() => expect(document.documentElement.dir).toBe('rtl'));
    await i18n.changeLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
