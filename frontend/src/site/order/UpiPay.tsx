import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Copy, ImageUp, Smartphone } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { isPhone, upiLink, useQrCode } from '@/lib/upi';
import { useMoney } from '../ordering';
import type { CustomerOrder, SiteData } from '../types';
import { useSkin } from './skin';

/**
 * "Pay by UPI" on the tracking page: open a UPI app with the amount filled in (phones) or
 * scan the QR, then send the UPI reference so the restaurant can match the payment.
 */
export function UpiPay({ site, order, token }: { site: SiteData; order: CustomerOrder; token: string }) {
  const { t } = useTranslation();
  const skin = useSkin();
  const money = useMoney();
  const qc = useQueryClient();
  const upi = site.ordering.upi;
  const [reference, setReference] = useState('');
  const [copied, setCopied] = useState(false);
  const link = upi ? upiLink({ vpa: upi.vpa, payee: upi.payee, amount: order.total, note: `${site.name} #${order.number}` }) : null;
  const qr = useQrCode(link, 220);
  const send = useMutation<unknown, ApiError>({
    mutationFn: () => api.post(`/site/orders/${order.id}/upi-reference`, { t: token, reference: reference.trim() }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['order', order.id, token] }),
  });
  // Or a screenshot of the payment (some UPI apps hide the UTR); staff open it in the order.
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useMutation<unknown, ApiError, File>({
    mutationFn: (file) => {
      const form = new FormData();
      form.append('t', token);
      form.append('image', file);
      return api.post(`/site/orders/${order.id}/upi-screenshot`, form);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['order', order.id, token] }),
  });
  if (!upi || !link || order.payment_method !== 'upi' || order.status === 'cancelled' || !['unpaid', 'pending'].includes(order.payment_status)) return null;
  const phone = isPhone();
  const copy = () => {
    void navigator.clipboard?.writeText(upi.vpa).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section className={`mt-6 p-5 ${skin.card}`} aria-labelledby="upi-h">
      <h2 id="upi-h" className={`text-2xl ${skin.heading}`}>
        {t('order.upi.title', { amount: money(Number(order.total)) })}
      </h2>
      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
        {qr && <img src={qr} alt={t('order.upi.qrAlt', { amount: money(Number(order.total)) })} width={220} height={220} className={`mx-auto rounded-xl bg-white p-1 sm:mx-0 ${phone ? 'order-2 w-40' : ''}`} />}
        <div className="flex-1 space-y-3">
          {phone && (
            <a href={link} className={`flex min-h-12 items-center justify-center gap-2 px-5 ${skin.primary}`}>
              <Smartphone className="h-5 w-5" aria-hidden="true" />
              {t('order.upi.open')}
            </a>
          )}
          <p className="text-sm text-t-muted">{phone ? t('order.upi.phoneHint') : t('order.upi.scanHint')}</p>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-t-muted">{t('order.upi.to')}</span>
            <span className="font-mono font-semibold">{upi.vpa}</span>
            <button type="button" onClick={copy} className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 font-semibold underline">
              {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied ? t('order.upi.copied') : t('order.upi.copy')}
            </button>
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-t-line pt-4" aria-live="polite">
        {order.payment_status === 'pending' && (order.payment_reference || order.has_payment_proof) ? (
          <p className="font-semibold">{order.payment_reference ? t('order.upi.sent', { reference: order.payment_reference }) : t('order.upi.shotSent')}</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
          >
            <label htmlFor="upi-ref" className="block font-semibold">
              {t('order.upi.refLabel')}
            </label>
            <p className="text-sm text-t-muted">{t('order.upi.refHint')}</p>
            <div className="mt-2 flex gap-2">
              <input id="upi-ref" inputMode="text" autoComplete="off" value={reference} onChange={(e) => setReference(e.target.value.replace(/\s+/g, ''))} maxLength={30} className={`min-w-0 flex-1 ${skin.input}`} placeholder="412345678901" aria-invalid={!!send.error} />
              <button type="submit" className={`min-h-12 px-5 ${skin.secondary}`} disabled={reference.trim().length < 6 || send.isPending}>
                {t('order.upi.send')}
              </button>
            </div>
            {send.error && (
              <p role="alert" className="mt-2 text-sm font-semibold text-[#b91c1c]">
                {send.error.message}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-sm text-t-muted">{t('order.upi.or')}</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label={t('order.upi.shot')}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload.mutate(file);
                  e.target.value = '';
                }}
              />
              <button type="button" className={`inline-flex min-h-11 items-center gap-2 px-4 ${skin.secondary}`} disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
                <ImageUp className="h-4 w-4" aria-hidden="true" />
                {upload.isPending ? t('order.upi.shotUploading') : t('order.upi.shot')}
              </button>
            </div>
            {upload.error && (
              <p role="alert" className="mt-2 text-sm font-semibold text-[#b91c1c]">
                {upload.error.message}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
