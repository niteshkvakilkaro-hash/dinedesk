import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api';
import { sendGuestCode, useGuestSignIn } from '../account';
import { useSkin } from './skin';

/** Phone → 6-digit SMS code → signed in on this website. */
export function GuestSignIn() {
  const { t } = useTranslation();
  const skin = useSkin();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const signIn = useGuestSignIn();

  const send = async () => {
    setError('');
    setSending(true);
    try {
      const res = await sendGuestCode(phone);
      if (res.data.dev_code) setCode(res.data.dev_code); // development only
      setStep('code');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('order.account.error'));
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (step === 'phone') void send();
        else signIn.mutate({ phone, code }, { onError: (err) => setError(err.message) });
      }}
    >
      {step === 'phone' ? (
        <label className="block">
          <span className="mb-1 block font-semibold">{t('order.account.phone')}</span>
          <span className="flex gap-2">
            <input type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98290 12345" className={`min-w-0 flex-1 ${skin.input}`} />
            <button type="submit" className={`min-h-12 px-5 ${skin.primary}`} disabled={sending || phone.replace(/\D/g, '').length < 10}>
              {t('order.account.sendCode')}
            </button>
          </span>
        </label>
      ) : (
        <label className="block">
          <span className="mb-1 block font-semibold">{t('order.account.code', { phone })}</span>
          <span className="flex gap-2">
            <input inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={`min-w-0 flex-1 tracking-[0.4em] ${skin.input}`} />
            <button type="submit" className={`min-h-12 px-5 ${skin.primary}`} disabled={signIn.isPending || code.length !== 6}>
              {t('order.account.signIn')}
            </button>
          </span>
          <button type="button" className="mt-2 text-sm font-semibold underline" onClick={() => { setStep('phone'); setCode(''); setError(''); }}>
            {t('order.account.changePhone')}
          </button>
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-[#b91c1c]">
          {error}
        </p>
      )}
    </form>
  );
}
