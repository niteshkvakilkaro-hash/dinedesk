import { beforeAll, describe, expect, it } from 'vitest';
import i18n from 'i18next';
import en from '@/i18n/en.json';
import hi from '@/i18n/hi.json';
import { describeAlert, type InAppAlert } from './alertText';

const t = i18n.createInstance();
beforeAll(async () => {
  await t.init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en }, hi: { translation: hi } }, interpolation: { escapeValue: false } });
});
const date = (iso: string) => `[${iso.slice(0, 10)}]`;
const alert = (data: Record<string, unknown>, kind = 'referral.reward'): InAppAlert => ({ id: 'a1', kind, data, created_at: null });

describe('in-app alert text', () => {
  it('says the free days were added, until when, and links to the referral card', () => {
    const view = describeAlert(alert({ business: 'Chai Point', days: 30, status: 'granted', until: '2026-12-01T10:00:00+05:30' }), t.getFixedT('en'), date);
    expect(view).toEqual({
      text: 'Chai Point started a paid plan with your referral link: 30 free days are added, and your plan or trial now runs until [2026-12-01].',
      to: '/dashboard/billing?open=refer',
      linkLabel: 'See your referrals',
    });
  });

  it('says the days are waiting when they could not be added yet', () => {
    const view = describeAlert(alert({ business: 'Chai Point', days: 30, status: 'pending', until: null }), t.getFixedT('en'), date);
    expect(view?.text).toContain('you earned 30 free days');
    expect(view?.text).not.toContain('[');
  });

  it("is written in the reader's language", () => {
    const view = describeAlert(alert({ business: 'Chai Point', days: 30, status: 'granted', until: '2026-12-01T10:00:00+05:30' }), t.getFixedT('hi'), date);
    expect(view?.text).toBe('Chai Point ने आपके रेफ़रल लिंक से पेड प्लान शुरू किया: 30 दिन मुफ़्त जोड़ दिए गए, अब आपका प्लान या ट्रायल [2026-12-01] तक चलेगा।');
    expect(view?.linkLabel).toBe('अपने रेफ़रल देखें');
  });

  it('leaves out kinds it does not know and incomplete alerts', () => {
    expect(describeAlert(alert({ name: 'Paneer' }, 'low_stock'), t.getFixedT('en'), date)).toBeNull();
    expect(describeAlert(alert({ business: '', days: 30, status: 'granted' }), t.getFixedT('en'), date)).toBeNull();
  });
});
