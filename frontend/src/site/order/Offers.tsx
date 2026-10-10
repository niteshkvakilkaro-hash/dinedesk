import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gift, Loader2, Tag, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { isIndianMobile } from '@/lib/format';
import { useMoney } from '../ordering';
import type { Quote, SiteData } from '../types';
import { useSkin } from './skin';

export interface OfferState {
  coupon: string | null;
  loyalty: { token: string; points: number; balance: number } | null;
}

/** Coupon code and loyalty points at checkout (both checked by the server with the live price). */
export function Offers({ site, phone, value, onChange, quote }: { site: SiteData; phone: string; value: OfferState; onChange: (v: OfferState) => void; quote: Quote | undefined }) {
  const { t } = useTranslation();
  const skin = useSkin();
  const money = useMoney();
  const growth = site.growth;
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'idle' | 'sent'>('idle');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loyaltyOn = growth?.loyalty.enabled;
  if (!growth?.coupons && !loyaltyOn) return null;

  const err = quote?.offer_error;
  const couponErr = err && (err.field === 'coupon_code' || err.code.startsWith('coupon')) ? err.message : '';
  const pointsErr = err && !couponErr ? err.message : '';
  const pointValue = growth.loyalty.point_value ?? 1;
  const earn = loyaltyOn && quote ? Math.floor((Number(quote.subtotal) / 100) * (growth.loyalty.earn_per_100 ?? 0)) : 0;

  const sendCode = async () => {
    setError('');
    if (!isIndianMobile(phone)) return setError(t('order.err.phone'));
    setBusy(true);
    try {
      const res = await api.post<{ sent: boolean; dev_code?: string }>('/site/loyalty/code', { phone });
      setStep('sent');
      if (res.data.dev_code) setOtp(res.data.dev_code); // development only
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await api.post<{ token: string; points: number; value: string }>('/site/loyalty/verify', { phone, code: otp });
      const max = growth.loyalty.min_redeem && res.data.points < growth.loyalty.min_redeem ? 0 : res.data.points;
      onChange({ ...value, loyalty: { token: res.data.token, points: max, balance: res.data.points } });
      setStep('idle');
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`space-y-4 p-5 ${skin.card}`} aria-labelledby="offers-h">
      <h2 id="offers-h" className={`text-2xl ${skin.heading}`}>
        {t('order.offersTitle')}
      </h2>

      {growth.coupons && (
        <div>
          {value.coupon ? (
            <p className={`flex min-h-12 items-center gap-2 px-3 ${skin.chip}`}>
              <Tag className="h-4 w-4" aria-hidden="true" />
              <span className="flex-1 font-semibold">
                {value.coupon}
                {quote?.coupon && <span className="font-normal"> · −{money(quote.coupon.discount)}</span>}
              </span>
              <button type="button" className="flex h-9 w-9 items-center justify-center" onClick={() => onChange({ ...value, coupon: null })} aria-label={t('order.removeCoupon')}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </p>
          ) : (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) onChange({ ...value, coupon: code.trim().toUpperCase() }); }}>
              <label className="flex-1">
                <span className="sr-only">{t('order.couponCode')}</span>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('order.couponCode')} autoCapitalize="characters" className={`block min-h-12 w-full px-3 uppercase ${skin.input}`} />
              </label>
              <button type="submit" className={`min-h-12 px-4 text-sm ${skin.secondary}`}>
                {t('order.apply')}
              </button>
            </form>
          )}
          {couponErr && (
            <p role="alert" className="mt-1.5 text-sm font-semibold text-[var(--s-error)]">
              {couponErr}
            </p>
          )}
        </div>
      )}

      {loyaltyOn && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Gift className="h-4 w-4" aria-hidden="true" />
            {earn > 0 ? t('order.earnPoints', { count: earn }) : t('order.loyaltyTitle')}
          </p>
          {value.loyalty ? (
            <div className={`space-y-2 p-3 ${skin.chip} !block`}>
              <p className="text-sm">{t('order.pointsBalance', { count: value.loyalty.balance, value: money(value.loyalty.balance * pointValue) })}</p>
              {value.loyalty.balance >= (growth.loyalty.min_redeem ?? 0) ? (
                <label className="flex items-center gap-2 text-sm">
                  <span>{t('order.usePoints')}</span>
                  <input
                    type="number"
                    min={0}
                    max={value.loyalty.balance}
                    value={value.loyalty.points}
                    onChange={(e) => onChange({ ...value, loyalty: { ...value.loyalty!, points: Math.max(0, Math.min(value.loyalty!.balance, Number(e.target.value) || 0)) } })}
                    className={`min-h-10 w-24 px-2 tabular-nums ${skin.input}`}
                  />
                  {quote?.loyalty && <span className="font-semibold">−{money(quote.loyalty.discount)}</span>}
                </label>
              ) : (
                <p className="text-sm text-t-muted">{t('order.pointsMin', { count: growth.loyalty.min_redeem })}</p>
              )}
              <button type="button" className="text-sm underline" onClick={() => onChange({ ...value, loyalty: null })}>
                {t('order.dontUsePoints')}
              </button>
            </div>
          ) : step === 'sent' ? (
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
              <label className="flex-1">
                <span className="sr-only">{t('order.codeSent')}</span>
                <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" className={`block min-h-12 w-full px-3 tracking-[0.3em] ${skin.input}`} />
              </label>
              <button type="submit" disabled={busy || otp.length !== 6} className={`min-h-12 px-4 text-sm ${skin.primary} disabled:opacity-50`}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : t('order.confirmCode')}
              </button>
              <p className="w-full text-xs text-t-muted">{t('order.codeSent')}</p>
            </form>
          ) : (
            <button type="button" disabled={busy} onClick={() => void sendCode()} className={`min-h-11 px-4 text-sm ${skin.secondary}`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : t('order.checkPoints')}
            </button>
          )}
          {(error || pointsErr) && (
            <p role="alert" className="text-sm font-semibold text-[var(--s-error)]">
              {error || pointsErr}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
